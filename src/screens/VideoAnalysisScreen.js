import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, Image, ScrollView } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { theme } from '../theme/theme';
import { X, Activity, Zap, Play, Pause, Check, ArrowLeft } from 'lucide-react-native';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Slider from '@react-native-community/slider';

export default function VideoAnalysisScreen({ poolLength, videoUri, apiKey, onFinish, onCancel }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState({});
  const [phase, setPhase] = useState('idle'); // idle -> uploading -> processing -> generating -> selecting -> analyzing

  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [mockData, setMockData] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [sliderValue, setSliderValue] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [startCandidates, setStartCandidates] = useState([]); // [{timeMs, reason, thumbUri, thumbWidth, thumbHeight}]
  const [endCandidates, setEndCandidates] = useState([]);
  const [allMilestones, setAllMilestones] = useState([]);
  const [selectedStartIdx, setSelectedStartIdx] = useState(null);
  const [selectedEndIdx, setSelectedEndIdx] = useState(null);
  const [selectStep, setSelectStep] = useState('start'); // start | end
  const [thumbAspectRatio, setThumbAspectRatio] = useState(9 / 16);
  
  const position = status.positionMillis || 0;
  const duration = status.durationMillis || 1;

  const handlePlaybackStatusUpdate = (newStatus) => {
    setStatus(newStatus);
    if (phase === 'analyzing' && endTime && newStatus.positionMillis >= endTime && !isFinished) {
      setIsFinished(true);
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pauseAsync();
      }
    }
  };

  const handleReplay = async () => {
    setIsFinished(false);
    setIsPlaying(true);
    if (videoRef.current) {
      const prePlayTime = Math.max(0, startTime - 1500);
      await videoRef.current.playFromPositionAsync(prePlayTime);
    }
  };

  const handleSlidingComplete = async (val) => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(val);
      setSliderValue(null);
      if (isFinished && val < endTime) {
        setIsFinished(false);
        setIsPlaying(true);
      }
    }
  };

  const formatTime = (ms) => {
    if (isNaN(ms) || ms === null) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSaveAndExit = () => {
    setPhase('finished');
    const actualSwimDurationMs = endTime - startTime;
    onFinish(mockData, actualSwimDurationMs, true);
  };

  const safeThumbnail = async (timeMs) => {
    try {
      const { uri, width, height } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: Math.max(0, Math.floor(timeMs)),
        quality: 0.6,
      });
      return { uri, width, height };
    } catch (err) {
      console.warn('thumbnail failed', timeMs, err?.message);
      return null;
    }
  };

  const formatTimePrecise = (ms) => {
    if (isNaN(ms) || ms == null) return '00:00.00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    const cs = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return `${m}:${s}.${cs}`;
  };

  const handleConfirmSelection = () => {
    if (selectedStartIdx === null || selectedEndIdx === null) return;
    const start = startCandidates[selectedStartIdx]?.timeMs;
    const end = endCandidates[selectedEndIdx]?.timeMs;
    if (start == null || end == null || end <= start) {
      Alert.alert('선택 오류', '도착 시점은 출발 시점보다 뒤여야 합니다.');
      return;
    }
    const filteredMilestones = (allMilestones || []).filter(
      m => m.timeMs > start && m.timeMs < end && m.distance > 0 && m.distance < poolLength
    );
    setStartTime(start);
    setEndTime(end);
    startAiAnalysisPlayback(start, end, filteredMilestones);
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

      const prompt = `너는 프로 수영 코치야. 이 수영장의 규격은 ${poolLength}m야. 영상(시각+오디오)을 정밀 분석해서 수영자의 출발/도착 시점과 구간 속도를 추적해줘.

# 출발(start) 정의 — 다음 중 가장 먼저 관측되는 순간
- 출발벽에 정지해 있던 피촬영자의 머리 또는 몸이 처음으로 움직이기 시작하는 프레임
- 또는 오디오에서 출발 신호로 추정되는 강한 음(예: "고", "출발", "흡", "삐", 호각, 박수 등)이 들리는 순간
출발 후보(startCandidates) **정확히 3개**를 시간 순서대로 제시해. 각 후보는 서로 다른 근거를 가져야 하고, 가능성이 가장 높은 것을 첫 번째에 둬.

# 도착(end) 정의 — 다음을 만족하는 가장 이른 순간
- 피촬영자의 손가락 끝이 도착벽에 처음 닿는 프레임 (터치 직전 마지막 스트로크가 아니라 실제 터치 순간)
도착 후보(endCandidates) **정확히 3개**를 시간 순서대로 제시해. 가능성이 가장 높은 것을 첫 번째에 둬.

# milestones (선택적, 2개 이상)
출발과 도착 사이에서 시각적 지표(5m 배영 깃발, 바닥 T자 라인, 15m 마커, 레인줄 색상 변화, 25m 중앙 마커 등)나 스트로크 템포 변화로 식별 가능한 거리/시간 통과 지점. 거리는 0보다 크고 ${poolLength}m보다 작아야 함.

순수 JSON만 반환:
{
  "reasoning": "1~2줄 요약",
  "startCandidates": [
    {"timeMs": 1200, "reason": "오디오 '출발' 음성 직후 머리 움직임 시작"},
    {"timeMs": 1450, "reason": "어깨가 벽에서 분리되는 첫 프레임"},
    {"timeMs": 900, "reason": "오디오 '흡' 강한 들숨 직전"}
  ],
  "endCandidates": [
    {"timeMs": 44850, "reason": "오른손 손가락이 도착벽 접촉"},
    {"timeMs": 45100, "reason": "양손 동시 터치 가능성"},
    {"timeMs": 44600, "reason": "직전 스트로크 마지막 풀 동작 종료"}
  ],
  "milestones": [{"distance": 5, "timeMs": 4500}, {"distance": 25, "timeMs": 22000}]
}`;

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

      const sanitize = (arr) =>
        (Array.isArray(arr) ? arr : [])
          .filter(c => typeof c?.timeMs === 'number' && c.timeMs >= 0)
          .slice(0, 3);

      let starts = sanitize(parsed.startCandidates);
      let ends = sanitize(parsed.endCandidates);

      // 방어 로직: 후보가 비면 단일값(startTime/endTime)이라도 살림
      if (starts.length === 0 && typeof parsed.startTime === 'number') {
        starts = [{ timeMs: parsed.startTime, reason: 'AI 단일 추정' }];
      }
      if (ends.length === 0 && typeof parsed.endTime === 'number') {
        ends = [{ timeMs: parsed.endTime, reason: 'AI 단일 추정' }];
      }
      if (starts.length === 0) starts = [{ timeMs: 1000, reason: '기본값' }];
      if (ends.length === 0) ends = [{ timeMs: Math.max(starts[0].timeMs + 5000, duration - 1000), reason: '기본값' }];

      const attachThumb = async (c) => {
        const thumb = await safeThumbnail(c.timeMs);
        return {
          ...c,
          thumbUri: thumb?.uri ?? null,
          thumbWidth: thumb?.width ?? null,
          thumbHeight: thumb?.height ?? null,
        };
      };
      const startsWithThumbs = await Promise.all(starts.map(attachThumb));
      const endsWithThumbs = await Promise.all(ends.map(attachThumb));

      const firstWithDims = [...startsWithThumbs, ...endsWithThumbs].find(
        c => c.thumbWidth && c.thumbHeight
      );
      if (firstWithDims) {
        setThumbAspectRatio(firstWithDims.thumbWidth / firstWithDims.thumbHeight);
      }

      setStartCandidates(startsWithThumbs);
      setEndCandidates(endsWithThumbs);
      setAllMilestones(parsed.milestones || []);
      setSelectedStartIdx(0);
      setSelectedEndIdx(0);
      setSelectStep('start');
      setPhase('selecting');

    } catch (e) {
      console.error(e);
      // 디버깅을 위해 catch 블록에서 사용 가능한 모델 리스트를 조회 시도
      let debugMsg = "";
      try {
        const debugRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const debugData = await debugRes.json();
        if (debugData.models) {
          debugMsg = "\n[사용 가능 모델]: " + debugData.models.map(m => m.name.replace('models/','')).filter(n => n.includes('gemini')).join(', ');
        }
      } catch (err) {}
      
      Alert.alert("분석 오류", `Gemini API 요청 실패: ${e.message}${debugMsg}\n(파일 크기나 네트워크를 확인해주세요)`);
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
    setIsPlaying(true);

    if (videoRef.current) {
      const prePlayTime = Math.max(0, start - 1500);
      await videoRef.current.playFromPositionAsync(prePlayTime);
    }
  };

  let currentDistance = 0;
  let displaySpeed = '0.00';

  if (phase === 'analyzing' && startTime !== null && endTime !== null) {
    if (position < startTime) {
      currentDistance = 0;
      displaySpeed = '0.00';
    } else if (position > endTime) {
      currentDistance = poolLength;
      displaySpeed = '0.00';
    } else {
      const swimDurationMs = endTime - startTime;
      const elapsedTimeMs = position - startTime;
      const progressRatio = elapsedTimeMs / swimDurationMs;

      currentDistance = Math.min(poolLength, Math.floor(progressRatio * poolLength));

      const currentDataPoint = mockData.find(d => d.distance === Math.max(1, currentDistance));
      displaySpeed = currentDataPoint ? currentDataPoint.speed.toFixed(2) : '0.00';
    }
  }

  const getLoadingMessage = () => {
    if (phase === 'uploading') return "Gemini AI로 영상 전송 중...";
    if (phase === 'processing') return "AI가 비디오를 스캔 중입니다...";
    if (phase === 'generating') return "출발/도착 후보를 정밀 분석 중...";
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
        shouldPlay={phase === 'analyzing' && isPlaying}
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

        {phase === 'selecting' && (() => {
          const isLandscape = thumbAspectRatio > 1.05;
          const currentList = selectStep === 'start' ? startCandidates : endCandidates;
          const currentIdx = selectStep === 'start' ? selectedStartIdx : selectedEndIdx;
          const setCurrentIdx = selectStep === 'start' ? setSelectedStartIdx : setSelectedEndIdx;
          const stepTitle = selectStep === 'start' ? '출발 시점을 선택해주세요' : '도착 시점을 선택해주세요';
          const stepHint = selectStep === 'start'
            ? '머리가 움직이기 시작하거나 출발 신호가 들리는 순간'
            : '손이 벽에 처음 닿는 순간';
          const canAdvance = currentIdx !== null;
          const isLastStep = selectStep === 'end';

          return (
            <View style={styles.selectingContainer}>
              <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.wizardHeader}>
                  <TouchableOpacity onPress={onCancel} style={styles.iconBtn}>
                    <X color={theme.colors.text} size={24} />
                  </TouchableOpacity>
                  <Text style={styles.wizardStepIndicator}>{selectStep === 'start' ? '1 / 2  출발' : '2 / 2  도착'}</Text>
                  {selectStep === 'end' ? (
                    <TouchableOpacity onPress={() => setSelectStep('start')} style={styles.wizardBackBtn}>
                      <ArrowLeft color={theme.colors.text} size={20} />
                    </TouchableOpacity>
                  ) : <View style={{ width: 40 }} />}
                </View>

                <ScrollView contentContainerStyle={styles.selectingScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.selectingTitle}>{stepTitle}</Text>
                  <Text style={styles.selectingHint}>{stepHint}</Text>

                  <View style={isLandscape ? styles.candidateColumn : styles.candidateRow}>
                    {currentList.map((c, idx) => (
                      <TouchableOpacity
                        key={`${selectStep}${idx}`}
                        style={[
                          isLandscape ? styles.candidateCardWide : styles.candidateCard,
                          currentIdx === idx && styles.candidateCardSelected,
                        ]}
                        onPress={() => setCurrentIdx(idx)}
                        activeOpacity={0.8}
                      >
                        {c.thumbUri ? (
                          <Image
                            source={{ uri: c.thumbUri }}
                            style={[styles.candidateThumb, { aspectRatio: thumbAspectRatio }]}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.candidateThumb, styles.candidateThumbPlaceholder, { aspectRatio: thumbAspectRatio }]}>
                            <Text style={styles.candidateThumbPlaceholderText}>썸네일 없음</Text>
                          </View>
                        )}
                        <Text style={styles.candidateTime}>{formatTimePrecise(c.timeMs)}</Text>
                        <Text style={styles.candidateReason}>{c.reason || ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <View style={styles.wizardFooter}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, !canAdvance && styles.confirmBtnDisabled]}
                    onPress={() => {
                      if (!canAdvance) return;
                      if (isLastStep) handleConfirmSelection();
                      else setSelectStep('end');
                    }}
                    disabled={!canAdvance}
                  >
                    <Check color={theme.colors.background} size={22} />
                    <Text style={styles.confirmBtnText}>
                      {isLastStep ? '이 구간으로 분석' : '다음: 도착 시점 선택'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </View>
          );
        })()}

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
            
            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)} style={styles.playPauseBtn}>
                {isPlaying ? <Pause color="white" size={20} /> : <Play color="white" size={20} fill="white" />}
              </TouchableOpacity>
              <Text style={styles.sliderTime}>{formatTime(sliderValue !== null ? sliderValue : position)}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration}
                value={sliderValue !== null ? sliderValue : position}
                onValueChange={setSliderValue}
                onSlidingComplete={handleSlidingComplete}
                minimumTrackTintColor={theme.colors.primary}
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor={theme.colors.primary}
              />
              <Text style={styles.sliderTime}>{formatTime(duration)}</Text>
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
            <View style={styles.finishedActions}>
              <TouchableOpacity style={styles.replayBtn} onPress={handleReplay}>
                <Play color={theme.colors.background} size={28} />
                <Text style={styles.replayBtnText}>다시보기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndExit}>
                <Check color={theme.colors.background} size={28} />
                <Text style={styles.saveBtnText}>저장 후 종료</Text>
              </TouchableOpacity>
            </View>
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
  analyzingText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  
  // Selecting Phase Styles (wizard)
  selectingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  wizardStepIndicator: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  wizardBackBtn: {
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: theme.borderRadius.round,
  },
  selectingScroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  selectingTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  selectingHint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  candidateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  candidateColumn: {
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  candidateCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  candidateCardWide: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  candidateCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0, 240, 255, 0.15)',
  },
  candidateThumb: {
    width: '100%',
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#111',
  },
  candidateThumbPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  candidateThumbPlaceholderText: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  candidateTime: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  candidateReason: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  wizardFooter: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  confirmBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  confirmBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  confirmBtnText: {
    color: theme.colors.background,
    fontSize: 18,
    fontWeight: '800',
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
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    zIndex: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  playPauseBtn: {
    marginRight: theme.spacing.md,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: theme.spacing.md,
  },
  sliderTime: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  finishedActions: {
    flexDirection: 'row',
    gap: theme.spacing.xl,
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
