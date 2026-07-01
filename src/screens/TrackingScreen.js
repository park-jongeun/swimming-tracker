import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '../theme/theme';
import { StopCircle, Flag, Play, X, Save } from 'lucide-react-native';

export default function TrackingScreen({ poolLength, onFinish, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startupPhase, setStartupPhase] = useState('idle'); // idle, waiting, mark, go
  const [elapsedTime, setElapsedTime] = useState(0); // in milliseconds
  const [laps, setLaps] = useState([]);
  
  const cameraRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const lapsRef = useRef([]);
  const elapsedTimeRef = useRef(0);

  useEffect(() => {
    lapsRef.current = laps;
  }, [laps]);

  useEffect(() => {
    elapsedTimeRef.current = elapsedTime;
  }, [elapsedTime]);

  useEffect(() => {
    if (!permission?.granted || !micPermission?.granted) {
      if (!permission?.granted) requestPermission();
      if (!micPermission?.granted) requestMicPermission();
    }
    return () => clearInterval(timerRef.current);
  }, [permission, micPermission]);

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10); // 2 digits
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const startRecordingSequence = () => {
    setStartupPhase('waiting');
    
    // 3초 대기
    setTimeout(() => {
      setStartupPhase('mark');
      Speech.speak('Take your mark', { language: 'en-US', rate: 0.9 });
      
      // Take your mark 이후 1.5초 대기 후 부저
      setTimeout(() => {
        setStartupPhase('go');
        Speech.speak('Beep!', { pitch: 1.8, rate: 2.0 }); // 부저 소리 대체
        
        // 실제 타이머 및 측정 시작
        setIsRecording(true);
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setElapsedTime(Date.now() - startTimeRef.current);
        }, 10);
        
        // 카메라 비디오 녹화 시작
        if (cameraRef.current) {
          cameraRef.current.recordAsync().then(async (result) => {
            try {
              const folderPath = FileSystem.documentDirectory + 'SwimTracker_Videos/';
              const folderInfo = await FileSystem.getInfoAsync(folderPath);
              if (!folderInfo.exists) {
                await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
              }
              const fileName = `swim_${Date.now()}.mp4`;
              const newPath = folderPath + fileName;
              await FileSystem.moveAsync({
                from: result.uri,
                to: newPath
              });
              console.log('Video saved to internal folder:', newPath);
              onFinish(lapsRef.current, elapsedTimeRef.current);
            } catch (e) {
              console.error('Failed to save video:', e);
              Alert.alert('저장 오류', '영상을 저장하는 데 실패했습니다.');
              onFinish(lapsRef.current, elapsedTimeRef.current);
            }
          }).catch(e => {
            console.error('Record async error:', e);
            onFinish(lapsRef.current, elapsedTimeRef.current);
          });
        }
        
        // 1초 뒤 화면의 GO 메시지 숨기기 위해 idle로 복귀
        setTimeout(() => setStartupPhase('idle'), 1000);

      }, 1500);
    }, 3000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsSaving(true);
    clearInterval(timerRef.current);
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    } else {
      onFinish(lapsRef.current, elapsedTimeRef.current);
    }
  };

  const markLap = () => {
    const lapTime = elapsedTime;
    const previousLapTime = laps.length > 0 ? laps[laps.length - 1].totalTime : 0;
    const lapDuration = lapTime - previousLapTime;
    
    // speed = distance / time (m/s)
    const speed = poolLength / (lapDuration / 1000); 
    
    setLaps([...laps, {
      lapNumber: laps.length + 1,
      totalTime: lapTime,
      duration: lapDuration,
      speed: speed
    }]);
  };

  if (!permission?.granted || !micPermission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>카메라 및 마이크 권한이 필요합니다.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => {
          requestPermission();
          requestMicPermission();
        }}>
          <Text style={styles.btnText}>권한 허용</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} mode="video" style={StyleSheet.absoluteFillObject} facing="back" />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.iconBtn}>
            <X color={theme.colors.text} size={28} />
          </TouchableOpacity>
          <View style={styles.timerBadge}>
            <View style={[styles.recordingDot, isRecording && styles.recordingDotActive]} />
            <Text style={styles.timerText}>{formatTime(elapsedTime)}</Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.lapInfo}>
          {startupPhase === 'waiting' && <Text style={styles.countdownText}>3초 후 준비...</Text>}
          {startupPhase === 'mark' && <Text style={styles.countdownText}>Take your mark</Text>}
          {startupPhase === 'go' && <Text style={[styles.countdownText, { color: theme.colors.success }]}>GO!</Text>}
          
          <Text style={styles.lapCount}>LAP {laps.length + 1}</Text>
          <Text style={styles.lapDistance}>{laps.length * poolLength}m 통과중</Text>
        </View>

        <View style={styles.controls}>
          {isSaving ? (
            <View style={[styles.controlBtn, styles.disabledStartBtn]}>
              <Save color={theme.colors.textMuted} size={32} />
              <Text style={styles.controlText}>저장 중...</Text>
            </View>
          ) : isRecording ? (
            <>
              <TouchableOpacity style={[styles.controlBtn, styles.stopBtn]} onPress={stopRecording}>
                <StopCircle color={theme.colors.text} size={32} />
                <Text style={styles.controlText}>완료</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.controlBtn, styles.lapBtn]} onPress={markLap}>
                <Flag color={theme.colors.background} size={40} />
                <Text style={[styles.controlText, { color: theme.colors.background }]}>구간 기록 (랩)</Text>
              </TouchableOpacity>
            </>
          ) : startupPhase !== 'idle' ? (
            <View style={[styles.controlBtn, styles.disabledStartBtn]}>
              <Text style={styles.controlText}>준비중...</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.controlBtn, styles.startBtn]} onPress={startRecordingSequence}>
              <Play color={theme.colors.background} size={40} fill={theme.colors.background} />
              <Text style={[styles.controlText, { color: theme.colors.background }]}>측정 시작</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: theme.colors.text,
    fontSize: 18,
    marginBottom: theme.spacing.lg,
  },
  btn: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  btnText: {
    color: theme.colors.background,
    fontWeight: 'bold',
  },
  overlay: {
    flex: 1,
    width: '100%',
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
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.round,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.textMuted,
    marginRight: theme.spacing.sm,
  },
  recordingDotActive: {
    backgroundColor: theme.colors.secondary,
  },
  timerText: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  lapInfo: {
    alignItems: 'center',
  },
  lapCount: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
  lapDistance: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    backdropFilter: 'blur(10px)', // Note: web only, but harmless
  },
  disabledStartBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  countdownText: {
    color: theme.colors.secondary,
    fontSize: 48,
    fontWeight: '900',
    marginBottom: theme.spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  lapBtn: {
    backgroundColor: theme.colors.primary,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  startBtn: {
    backgroundColor: theme.colors.success,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  stopBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
  },
  controlText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    marginTop: theme.spacing.xs,
    fontSize: 16,
  }
});
