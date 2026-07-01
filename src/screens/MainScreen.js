import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../theme/theme';
import { Activity, Ruler, Upload, Key, Folder } from 'lucide-react-native';

export default function MainScreen({ onStart, onUpload, onLibrary, apiKey, setApiKey }) {
  const [poolLength, setPoolLength] = useState('50');

  const pickVideo = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true, // required for video export presets / quality compression on some platforms
        quality: 0.1,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Low, // drastically reduces size on iOS
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        onUpload(parseInt(poolLength) || 50, result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert("업로드 오류", "동영상을 불러오는 중 문제가 발생했습니다.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Activity color={theme.colors.primary} size={48} />
        <Text style={styles.title}>SwimTracker</Text>
        <Text style={styles.subtitle}>수영 페이스 및 구간 기록 측정</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.inputGroup}>
          <Ruler color={theme.colors.textMuted} size={24} />
          <Text style={styles.label}>수영장 길이 (m)</Text>
        </View>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={poolLength}
          onChangeText={setPoolLength}
          maxLength={3}
        />
        
        <View style={styles.presetButtons}>
          <TouchableOpacity 
            style={[styles.presetBtn, poolLength === '25' && styles.presetBtnActive]} 
            onPress={() => setPoolLength('25')}>
            <Text style={[styles.presetText, poolLength === '25' && styles.presetTextActive]}>25m</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.presetBtn, poolLength === '50' && styles.presetBtnActive]} 
            onPress={() => setPoolLength('50')}>
            <Text style={[styles.presetText, poolLength === '50' && styles.presetTextActive]}>50m</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={[styles.actionBtn, styles.startBtn]} 
          onPress={() => onStart(parseInt(poolLength) || 50)}
        >
          <Text style={styles.actionBtnText}>실시간 측정</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionBtn, styles.uploadBtn]} 
          onPress={pickVideo}
        >
          <Upload color={theme.colors.primary} size={24} />
          <Text style={styles.uploadBtnText}>영상 업로드</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={[styles.actionBtn, styles.libraryBtn]} 
        onPress={onLibrary}
      >
        <Folder color={theme.colors.text} size={24} />
        <Text style={styles.libraryBtnText}>보관함 (저장된 영상)</Text>
      </TouchableOpacity>

      <View style={styles.apiCard}>
        <View style={styles.apiHeader}>
          <Key color={theme.colors.textMuted} size={16} />
          <Text style={styles.apiLabel}>Gemini API Key (자동 분석용)</Text>
        </View>
        <TextInput
          style={styles.apiInput}
          placeholder="AI Studio에서 발급받은 키 입력..."
          placeholderTextColor={theme.colors.textMuted}
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry={true}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  label: {
    color: theme.colors.text,
    fontSize: 18,
    marginLeft: theme.spacing.sm,
    fontWeight: '600',
  },
  input: {
    backgroundColor: theme.colors.background,
    color: theme.colors.primary,
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  presetButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  presetBtn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  presetBtnActive: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderColor: theme.colors.primary,
  },
  presetText: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  presetTextActive: {
    color: theme.colors.primary,
  },
  actionRow: {
    gap: theme.spacing.md,
  },
  actionBtn: {
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.borderRadius.round,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  startBtn: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  uploadBtn: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  actionBtnText: {
    color: theme.colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
  uploadBtnText: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  libraryBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: theme.spacing.md,
  },
  libraryBtnText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  apiCard: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  apiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  apiLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  apiInput: {
    color: theme.colors.text,
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  }
});
