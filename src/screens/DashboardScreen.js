import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Dimensions, Modal, TextInput, FlatList, Alert, ActivityIndicator } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { theme } from '../theme/theme';
import { RotateCcw, Share, Trophy, Zap, Activity, Save, X, Folder, Plus } from 'lucide-react-native';
import { StorageService } from '../services/StorageService';

const screenWidth = Dimensions.get('window').width;

export default function DashboardScreen({ data, totalTime, poolLength, isAiAnalyzed, onReset, videoUri, isReadOnly }) {
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [recordTitle, setRecordTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isSaveModalVisible) {
      loadFolders();
    }
  }, [isSaveModalVisible]);

  const loadFolders = async () => {
    const f = await StorageService.getFolders();
    setFolders(f);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await StorageService.createFolder(newFolderName.trim());
      setNewFolderName('');
      loadFolders();
    } catch (e) {
      Alert.alert("오류", "폴더를 생성하지 못했습니다.");
    }
  };

  const handleSaveFolder = async (folder) => {
    setIsSaving(true);
    try {
      const finalTitle = recordTitle.trim() || `${new Date().toLocaleDateString()} 분석 기록`;
      await StorageService.saveRecord({
        folderId: folder.id,
        title: finalTitle,
        originalVideoUri: videoUri,
        data,
        totalTime,
        poolLength,
        isAiAnalyzed
      });
      setIsSaveModalVisible(false);
      Alert.alert("저장 완료", "기록이 폴더에 저장되었습니다.");
    } catch (e) {
      Alert.alert("오류", "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const totalDistance = isAiAnalyzed ? poolLength : data.length * poolLength;
  const avgSpeed = totalDistance > 0 ? (totalDistance / (totalTime / 1000)).toFixed(2) : '0.00';
  
  const renderAiChart = () => {
    if (!isAiAnalyzed || data.length === 0) return null;

    const chartLabels = data.filter(d => d.distance % 5 === 0 || d.distance === 1).map(d => `${d.distance}m`);
    const chartData = data.map(d => d.speed);

    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartHeaderRow}>
          <Activity color={theme.colors.secondary} size={20} />
          <Text style={styles.chartTitle}>구간별 정밀 속도 분석 (1m 단위)</Text>
        </View>
        <Text style={styles.chartSub}>초반, 중반, 후반의 페이스 변화를 확인하세요.</Text>
        
        <LineChart
          data={{
            labels: chartLabels,
            datasets: [{ data: chartData }]
          }}
          width={screenWidth - theme.spacing.lg * 2}
          height={220}
          yAxisSuffix=" m/s"
          withInnerLines={false}
          withOuterLines={false}
          chartConfig={{
            backgroundColor: theme.colors.surface,
            backgroundGradientFrom: theme.colors.surface,
            backgroundGradientTo: theme.colors.surface,
            decimalPlaces: 2,
            color: (opacity = 1) => `rgba(0, 240, 255, ${opacity})`,
            labelColor: (opacity = 1) => theme.colors.textMuted,
            style: { borderRadius: 16 },
            propsForDots: {
              r: "3",
              strokeWidth: "2",
              stroke: theme.colors.secondary
            }
          }}
          bezier
          style={{
            marginVertical: 8,
            borderRadius: 16,
            marginLeft: -10,
          }}
        />
      </View>
    );
  };

  const renderManualLaps = () => {
    if (isAiAnalyzed) return null;
    const laps = data;
    const fastestLap = laps.length > 0 ? laps.reduce((prev, current) => (prev.duration < current.duration) ? prev : current) : null;

    return (
      <View style={styles.lapList}>
        <Text style={styles.sectionTitle}>구간 기록 (랩타임)</Text>
        {laps.length === 0 ? (
          <Text style={styles.emptyText}>기록된 랩이 없습니다.</Text>
        ) : (
          laps.map((lap, index) => {
            const isFastest = fastestLap && fastestLap.lapNumber === lap.lapNumber;
            return (
              <View key={index} style={[styles.lapItem, isFastest && styles.fastestLapItem]}>
                <View style={styles.lapLeft}>
                  <Text style={styles.lapNumber}>LAP {lap.lapNumber}</Text>
                  <Text style={styles.lapDist}>{lap.lapNumber * poolLength}m</Text>
                </View>
                <View style={styles.lapRight}>
                  <Text style={[styles.lapDuration, isFastest && styles.fastestText]}>
                    {formatTime(lap.duration)}
                  </Text>
                  <Text style={styles.lapSpeed}>{lap.speed.toFixed(2)} m/s</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  };

  const renderFolderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.folderSelectItem}
      onPress={() => handleSaveFolder(item)}
      disabled={isSaving}
    >
      <Folder color={theme.colors.primary} size={24} />
      <Text style={styles.folderSelectName}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isReadOnly ? '저장된 분석 결과' : '측정 결과'}</Text>
        
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Trophy color={theme.colors.primary} size={24} style={styles.cardIcon} />
            <Text style={styles.cardLabel}>총 시간</Text>
            <Text style={styles.cardValue}>{formatTime(totalTime)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Zap color={theme.colors.secondary} size={24} style={styles.cardIcon} />
            <Text style={styles.cardLabel}>총 거리 / 평균 속도</Text>
            <Text style={styles.cardValue}>{totalDistance}m</Text>
            <Text style={styles.cardSubValue}>{avgSpeed} m/s</Text>
          </View>
        </View>

        {isAiAnalyzed ? renderAiChart() : renderManualLaps()}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.resetBtn]} onPress={onReset}>
            {isReadOnly ? <X color={theme.colors.text} size={20} /> : <RotateCcw color={theme.colors.text} size={20} />}
            <Text style={styles.actionText}>{isReadOnly ? '닫기' : '다시 측정'}</Text>
          </TouchableOpacity>
          
          {!isReadOnly && (
            <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={() => setIsSaveModalVisible(true)}>
              <Save color={theme.colors.background} size={20} />
              <Text style={[styles.actionText, { color: theme.colors.background }]}>폴더에 저장</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Save Modal */}
      <Modal
        visible={isSaveModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsSaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>기록 저장하기</Text>
              <TouchableOpacity onPress={() => setIsSaveModalVisible(false)}>
                <X color={theme.colors.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.recordTitleInput}
              placeholder="저장할 기록의 제목 (예: 접영 50m 기록 단축)"
              placeholderTextColor={theme.colors.textMuted}
              value={recordTitle}
              onChangeText={setRecordTitle}
            />

            <Text style={styles.modalSub}>저장할 폴더 선택</Text>

            <FlatList
              data={folders}
              keyExtractor={item => item.id}
              renderItem={renderFolderItem}
              style={styles.folderList}
              ListEmptyComponent={<Text style={styles.emptyText}>생성된 폴더가 없습니다.</Text>}
            />

            <View style={styles.createFolderRow}>
              <TextInput
                style={styles.folderInput}
                placeholder="새 폴더 이름"
                placeholderTextColor={theme.colors.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
              />
              <TouchableOpacity style={styles.createFolderBtn} onPress={handleCreateFolder}>
                <Plus color={theme.colors.background} size={20} />
              </TouchableOpacity>
            </View>

            {isSaving && (
              <View style={styles.savingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.savingText}>저장 중...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  content: { padding: theme.spacing.lg },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.text, marginBottom: theme.spacing.xl, marginTop: theme.spacing.md },
  summaryGrid: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  summaryCard: { flex: 1, backgroundColor: theme.colors.surface, padding: theme.spacing.lg, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.border },
  cardIcon: { marginBottom: theme.spacing.sm },
  cardLabel: { color: theme.colors.textMuted, fontSize: 14, marginBottom: theme.spacing.xs },
  cardValue: { color: theme.colors.text, fontSize: 24, fontWeight: 'bold' },
  cardSubValue: { color: theme.colors.primary, fontSize: 14, fontWeight: '600', marginTop: theme.spacing.xs },
  chartContainer: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.xl, borderWidth: 1, borderColor: 'rgba(0, 240, 255, 0.2)' },
  chartHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  chartTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  chartSub: { color: theme.colors.textMuted, fontSize: 14, marginBottom: theme.spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.md },
  lapList: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.xl },
  emptyText: { color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
  lapItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  fastestLapItem: { backgroundColor: 'rgba(0, 240, 255, 0.1)', borderRadius: theme.borderRadius.sm, paddingHorizontal: theme.spacing.sm, marginHorizontal: -theme.spacing.sm },
  lapLeft: { flexDirection: 'column' },
  lapNumber: { color: theme.colors.textMuted, fontSize: 14, fontWeight: 'bold' },
  lapDist: { color: theme.colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  lapRight: { alignItems: 'flex-end' },
  lapDuration: { color: theme.colors.text, fontSize: 18, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  fastestText: { color: theme.colors.primary },
  lapSpeed: { color: theme.colors.textMuted, fontSize: 14, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg, marginBottom: theme.spacing.xxl },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg, borderRadius: theme.borderRadius.round, gap: theme.spacing.sm },
  resetBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  shareBtn: { backgroundColor: theme.colors.primary },
  actionText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadius.lg, borderTopRightRadius: theme.borderRadius.lg, padding: theme.spacing.lg, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
  recordTitleInput: { backgroundColor: theme.colors.background, color: theme.colors.text, fontSize: 16, padding: theme.spacing.md, borderRadius: theme.borderRadius.sm, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.lg },
  modalSub: { color: theme.colors.textMuted, fontSize: 14, marginBottom: theme.spacing.sm },
  folderList: { maxHeight: 200, marginBottom: theme.spacing.lg },
  folderSelectItem: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.md, backgroundColor: theme.colors.background, borderRadius: theme.borderRadius.sm, marginBottom: theme.spacing.sm },
  folderSelectName: { color: theme.colors.text, fontSize: 16, marginLeft: theme.spacing.sm },
  createFolderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  folderInput: { flex: 1, backgroundColor: theme.colors.background, color: theme.colors.text, fontSize: 16, padding: theme.spacing.md, borderRadius: theme.borderRadius.sm, borderWidth: 1, borderColor: theme.colors.border },
  createFolderBtn: { backgroundColor: theme.colors.primary, padding: theme.spacing.md, borderRadius: theme.borderRadius.sm },
  savingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', borderRadius: theme.borderRadius.lg },
  savingText: { color: theme.colors.text, marginTop: theme.spacing.md, fontSize: 16, fontWeight: 'bold' }
});
