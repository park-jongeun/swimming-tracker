import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { theme } from '../theme/theme';
import { RotateCcw, Share, Trophy, Zap, Activity } from 'lucide-react-native';

const screenWidth = Dimensions.get('window').width;

export default function DashboardScreen({ data, totalTime, poolLength, isAiAnalyzed, onReset }) {
  
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // If AI analyzed, data is an array of { distance, speed }
  // If manual, data is an array of laps { lapNumber, duration, speed }
  
  const totalDistance = isAiAnalyzed ? poolLength : data.length * poolLength;
  const avgSpeed = totalDistance > 0 ? (totalDistance / (totalTime / 1000)).toFixed(2) : '0.00';
  
  const renderAiChart = () => {
    if (!isAiAnalyzed || data.length === 0) return null;

    // Sample data every 5m for cleaner X-axis labels
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
            marginLeft: -10, // Slight visual adjustment
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>측정 결과</Text>
        
        {/* Summary Cards */}
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

        {/* Dynamic Section: AI Chart vs Manual Laps */}
        {isAiAnalyzed ? renderAiChart() : renderManualLaps()}

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.resetBtn]} onPress={onReset}>
            <RotateCcw color={theme.colors.text} size={20} />
            <Text style={styles.actionText}>다시 측정</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]}>
            <Share color={theme.colors.background} size={20} />
            <Text style={[styles.actionText, { color: theme.colors.background }]}>결과 리포트 저장</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: theme.spacing.xl,
    marginTop: theme.spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardIcon: {
    marginBottom: theme.spacing.sm,
  },
  cardLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginBottom: theme.spacing.xs,
  },
  cardValue: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  cardSubValue: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
  },
  
  // AI Chart Styles
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.2)', // glow border
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  chartSub: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginBottom: theme.spacing.lg,
  },

  // Manual Laps Styles
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  lapList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    padding: theme.spacing.xl,
  },
  lapItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  fastestLapItem: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    marginHorizontal: -theme.spacing.sm,
  },
  lapLeft: {
    flexDirection: 'column',
  },
  lapNumber: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: 'bold',
  },
  lapDist: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  lapRight: {
    alignItems: 'flex-end',
  },
  lapDuration: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  fastestText: {
    color: theme.colors.primary,
  },
  lapSpeed: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  
  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.round,
    gap: theme.spacing.sm,
  },
  resetBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  shareBtn: {
    backgroundColor: theme.colors.primary,
  },
  actionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  }
});
