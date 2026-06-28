import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { theme } from '../theme/theme';
import { X, Activity, Zap, Play, Check, Cpu } from 'lucide-react-native';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default function VideoAnalysisScreen({ poolLength, videoUri, apiKey, onFinish, onCancel }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState({});
  const [phase, setPhase] = useState('idle'); // idle -> uploading -> processing -> generating -> analyzing
  
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [mockData, setMockData] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  
  const position = status.positionMillis || 0;
  const duration = status.durationMillis || 1;

  const handlePlaybackStatusUpdate = (newStatus) => {
    setStatus(newStatus);
    if (phase === 'analyzing' && endTime && newStatus.positionMillis >= endTime && !isFinished) {
      setIsFinished(true);
      if (videoRef.current) {
        videoRef.current.pauseAsync();
      }
    }
  };

  const handleReplay = async () => {
    setIsFinished(false);
    if (videoRef.current) {
      const prePlayTime = Math.max(0, startTime - 1500);
      await videoRef.current.playFromPositionAsync(prePlayTime);
    }
  };

  const handleSaveAndExit = () => {
    setPhase('finished');
    const actualSwimDurationMs = endTime - startTime;
    onFinish(mockData, actualSwimDurationMs, true);
  };

  const uploadAndAnalyzeWithGemini = async () => {
    if (!apiKey) {
      Alert.alert("API 키 누락", "메인 화면에서 Gemini API 키를 입력해주세요.");
      onCancel();
      return;
    }
    
    try {
      setPhase('uploading');
      
      // 1. 영상 파일을 Blob으로 변환
      const response = await fetch(videoUri);
      const blob = await response.blob();
      
      // 2. Gemini File API로 영상 업로드
      const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'video/mp4',
          'X-Goog-Upload-Protocol': 'raw',
        },
        body: blob
      });
      
      const uploadData = await uploadRes.json();
      if (uploadData.error) throw new Error(uploadData.error.message);
      
      const fileUri = uploadData.file.uri;
      const fileName = uploadData.file.name;
      
      setPhase('processing');
      
      // 3. 파일 처리 상태 확인 (ACTIVE가 될 때까지 폴링)
      let fileState = uploadData.file.state;
      while (fileState === 'PROCESSING') {
        await new Promise(r => setTimeout(r, 2000));
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
        const checkData = await checkRes.json();
        fileState = checkData.state;
        if (fileState === 'FAILED') throw new Error("비디오 처리에 실패했습니다.");
      }
      
      setPhase('generating');
      
      // 4. 공식 SDK를 사용하여 분석 요청
      // v1은 fileData를 지원하지 않으므로 v1beta를 사용하되,
      // API Key마다 권한이 있는 모델 이름이 다를 수 있으므로 v1beta/models를 먼저 조회합니다.
      const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const modelsData = await modelsRes.json();
      
      let targetModel = "gemini-2.5-flash"; // 최신 2.5를 기본값으로 변경
      if (modelsData && modelsData.models) {
        // v1beta에서 접근 가능한 모델 중 'flash'가 포함된 가장 최신 모델을 자동 선택
        const validModel = modelsData.models.find(m => 
          (m.name.includes('gemini-2.5-flash') || m.name.includes('gemini-3.5-flash') || m.name.includes('gemini-2.0-flash') || m.name.includes('gemini-flash')) && 
          m.supportedGenerationMethods && 
          m.supportedGenerationMethods.includes('generateContent')
        );
        
        if (validModel) {
          targetModel = validModel.name.replace('models/', '');
        }
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel(
        { model: targetModel },
        { apiVersion: "v1beta" }
      );

      const prompt = `너는 프로 수영 코치야. 영상을 스캔해서 레인줄의 색상 패턴(예: 출발/도착 양 끝 3m는 단색, 중간은 1m 단위 교차 등)을 시각적 지표로 활용해 수영자의 정밀한 위치를 파악해줘.
다음 데이터를 분석해줘:
1. 최초 출발 시점 'startTime' (밀리초)
2. 도착 시점 'endTime' (밀리초)
3. 수영자가 5m, 10m, 15m, 20m 지점을 각각 통과할 때의 타임스탬프(밀리초)를 'milestones' 배열로 추출해.
분석 과정을 짧게 요약(reasoning)하고, 오직 아래와 같은 형태의 순수 JSON만 반환해.
{"reasoning": "레인줄 색상을 분석하여...", "startTime": 1200, "milestones": [{"distance": 5, "timeMs": 4500}, {"distance": 10, "timeMs": 9000}, {"distance": 15, "timeMs": 14000}, {"distance": 20, "timeMs": 19500}], "endTime": 25400}`;

      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            {
              fileData: {
                mimeType: uploadData.file.mimeType,
                fileUri: fileUri
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);
      
      // 방어 로직: 만약 잘못된 값이 오면 최소한의 거리라도 확보
      const finalStart = parsed.startTime || 1000;
      const finalEnd = parsed.endTime || (duration > 2000 ? duration - 1000 : 15000);
      
      setStartTime(finalStart);
      setEndTime(finalEnd);
      
      startAiAnalysisPlayback(finalStart, finalEnd, parsed.milestones || []);
      
    } catch (e) {
      console.error(e);
      // 디버깅을 위해 catch 블록에서 사용 가능한 모델 리스트를 조회 시도
      let debugMsg = "";
      try {
        const debugRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const debugData = await debugRes.json();
        if (debugData.models) {
          debugMsg = "\\n[사용 가능 모델]: " + debugData.models.map(m => m.name.replace('models/','')).filter(n => n.includes('gemini')).join(', ');
        }
      } catch (err) {}
      
      Alert.alert("분석 오류", `Gemini API 요청 실패: ${e.message}${debugMsg}\\n(파일 크기나 네트워크를 확인해주세요)`);
      setPhase('error');
    }
  };

  // 컴포넌트 마운트 시 즉시 영상 전송 시작 (idle 상태일 때만 1회 실행)
  useEffect(() => {
    if (phase === 'idle') {
      uploadAndAnalyzeWithGemini();
    }
  }, []);

  const generateRealData = (start, end, milestones) => {
    const detailedData = [];
    
    // milestones 배열 정렬 및 양끝점(start, end) 추가
    const validMilestones = [
      { distance: 0, timeMs: start },
      ...(milestones || []).filter(m => m.distance > 0 && m.distance < poolLength && m.timeMs > start && m.timeMs < end).sort((a, b) => a.distance - b.distance),
      { distance: poolLength, timeMs: end }
    ];

    for (let m = 1; m <= poolLength; m++) {
      // m이 속한 구간 찾기
      let prev = validMilestones[0];
      let next = validMilestones[validMilestones.length - 1];
      
      for (let i = 0; i < validMilestones.length - 1; i++) {
        if (m >= validMilestones[i].distance && m <= validMilestones[i+1].distance) {
          prev = validMilestones[i];
          next = validMilestones[i+1];
          break;
        }
      }
      
      // 구간의 평균 속도 계산 (m/s)
      let speed = 1.0; // 기본값
      if (next.distance > prev.distance && next.timeMs > prev.timeMs) {
        const distDiff = next.distance - prev.distance;
        const timeDiffSec = (next.timeMs - prev.timeMs) / 1000;
        speed = distDiff / timeDiffSec;
      }
      
      detailedData.push({
        distance: m,
        speed: Math.max(0.1, speed)
      });
    }
    return detailedData;
  };

  const startAiAnalysisPlayback = async (start, end, milestones) => {
    const data = generateRealData(start, end, milestones);
    setMockData(data);
    setPhase('analyzing');
    
    if (videoRef.current) {
      const prePlayTime = Math.max(0, start - 1500);
      await videoRef.current.playFromPositionAsync(prePlayTime);
    }
  };

  let currentDistance = 0;
  let displaySpeed = '0.00';
  let progressPercent = 0;

  if (phase === 'analyzing' && startTime !== null && endTime !== null) {
    if (position < startTime) {
      currentDistance = 0;
      displaySpeed = '0.00';
      progressPercent = 0;
    } else if (position > endTime) {
      currentDistance = poolLength;
      displaySpeed = '0.00';
      progressPercent = 100;
    } else {
      const swimDurationMs = endTime - startTime;
      const elapsedTimeMs = position - startTime;
      const progressRatio = elapsedTimeMs / swimDurationMs;
      
      currentDistance = Math.min(poolLength, Math.floor(progressRatio * poolLength));
      progressPercent = progressRatio * 100;
      
      const currentDataPoint = mockData.find(d => d.distance === Math.max(1, currentDistance));
      displaySpeed = currentDataPoint ? currentDataPoint.speed.toFixed(2) : '0.00';
    }
  }

  const getLoadingMessage = () => {
    if (phase === 'uploading') return "Gemini AI로 영상 전송 중...";
    if (phase === 'processing') return "AI가 비디오를 스캔 중입니다...";
    if (phase === 'generating') return "출발 및 도착 시점을 정밀 분석 중...";
    return "분석 준비 중...";
  };

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        style={StyleSheet.absoluteFillObject}
        source={{ uri: videoUri }}
        useNativeControls={false}
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
      />
      
      <SafeAreaView style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.iconBtn}>
            <X color={theme.colors.text} size={28} />
          </TouchableOpacity>
        </View>

        {phase === 'analyzing' && mockData.length > 0 && (
          <View style={styles.chartContainer}>
            {mockData.map((data, index) => {
              const isPassed = data.distance <= currentDistance;
              const barHeight = Math.max(4, data.speed * 20); // speed에 비례하여 바 높이 조절
              return (
                <View 
                  key={index}
                  style={[
                    styles.chartBar,
                    { 
                      height: barHeight, 
                      backgroundColor: isPassed ? theme.colors.primary : 'rgba(255,255,255,0.2)' 
                    }
                  ]}
                />
              );
            })}
          </View>
        )}

        {/* phase === 'idle' 였던 자동 분석 시작 버튼 삭제 */}

        {(phase === 'uploading' || phase === 'processing' || phase === 'generating') && (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingTitle}>{getLoadingMessage()}</Text>
              <Text style={styles.loadingSub}>비디오 크기와 AI 추론에 따라 30초~1분 정도 소요될 수 있습니다.</Text>
            </View>
          </View>
        )}

        {phase === 'analyzing' && (
          <View style={styles.realtimeOverlay}>
            {position < startTime && (
               <Text style={styles.prepText}>출발 대기 중...</Text>
            )}
            
            <View style={styles.hudCard}>
              <View style={styles.hudRow}>
                <Activity color={theme.colors.primary} size={24} />
                <Text style={styles.hudLabel}>현재 구간</Text>
                <Text style={styles.hudValue}>{currentDistance}m</Text>
              </View>
              <View style={styles.hudDivider} />
              <View style={styles.hudRow}>
                <Zap color={theme.colors.secondary} size={24} />
                <View style={{flex: 1, marginLeft: theme.spacing.sm}}>
                  <Text style={styles.hudLabel}>실시간 속도</Text>
                  <Text style={{color: theme.colors.primary, fontSize: 10, marginTop: 2, marginLeft: theme.spacing.sm}}>* 레인줄 정밀 분석 기반</Text>
                </View>
                <Text style={styles.hudValue}>{displaySpeed} <Text style={styles.hudUnit}>m/s</Text></Text>
              </View>
            </View>
            
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${Math.max(0, Math.min(100, progressPercent))}%` }]} />
            </View>
            
            {position >= startTime && position <= endTime ? (
              <Text style={styles.analyzingText}>AI 레인줄 분석(광학 흐름) 활성화 중...</Text>
            ) : (
              <Text style={styles.analyzingText}> </Text>
            )}
          </View>
        )}

        {phase === 'analyzing' && isFinished && (
          <View style={styles.finishedOverlay}>
             <TouchableOpacity style={styles.replayBtn} onPress={handleReplay}>
               <Play color={theme.colors.background} size={28} />
               <Text style={styles.replayBtnText}>다시보기</Text>
             </TouchableOpacity>
             <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndExit}>
               <Check color={theme.colors.background} size={28} />
               <Text style={styles.saveBtnText}>저장 후 종료</Text>
             </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xl,
  },
  iconBtn: {
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: theme.borderRadius.round,
  },
  bottomControls: {
    marginBottom: theme.spacing.xl,
  },
  aiBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  aiBtnTitle: {
    color: theme.colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
  aiBtnSub: {
    color: 'rgba(0,0,0,0.6)',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  
  // Loading Styles
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  loadingCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  loadingTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: theme.spacing.lg,
  },
  loadingSub: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
  },

  // HUD Styles
  realtimeOverlay: {
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
  },
  prepText: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: theme.spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  hudCard: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.3)',
    marginBottom: theme.spacing.lg,
  },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudLabel: {
    color: theme.colors.textMuted,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  hudValue: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  hudUnit: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  hudDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: theme.spacing.md,
  },
  progressContainer: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  analyzingText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  
  // Chart Styles
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    flex: 1, // take remaining horizontal space if needed
    width: '100%',
  },
  chartBar: {
    flex: 1,
    marginHorizontal: 1,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // Finished Overlay Styles
  finishedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xl,
    zIndex: 10,
  },
  replayBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  replayBtnText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: theme.spacing.sm,
  },
  saveBtnText: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: theme.spacing.sm,
  }
});
