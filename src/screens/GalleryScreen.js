import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { theme } from '../theme/theme';
import { X, Folder, FileVideo, Share2, Play, Trash2 } from 'lucide-react-native';
import { Video, ResizeMode } from 'expo-av';

export default function GalleryScreen({ onBack, onAnalyzeVideo }) {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      const folderPath = FileSystem.documentDirectory + 'SwimTracker_Videos/';
      const folderInfo = await FileSystem.getInfoAsync(folderPath);
      
      if (!folderInfo.exists) {
        setVideos([]);
        return;
      }

      const files = await FileSystem.readDirectoryAsync(folderPath);
      // 필터링: mp4 파일만, 그리고 생성 날짜 순(이름에 타임스탬프가 있음) 정렬
      const videoFiles = files
        .filter(f => f.endsWith('.mp4'))
        .sort((a, b) => b.localeCompare(a)); // 최신순 (내림차순)

      // 파일 메타데이터 가져오기
      const videoData = await Promise.all(
        videoFiles.map(async (filename) => {
          const fileUri = folderPath + filename;
          const info = await FileSystem.getInfoAsync(fileUri);
          return {
            id: filename,
            uri: fileUri,
            name: filename,
            size: info.size,
            // 파일명(swim_123123.mp4)에서 타임스탬프 추출
            timestamp: parseInt(filename.replace('swim_', '').replace('.mp4', '')),
          };
        })
      );

      setVideos(videoData);
    } catch (error) {
      console.error('Failed to load videos', error);
      Alert.alert('오류', '영상 목록을 불러오는 데 실패했습니다.');
    }
  };

  const deleteVideo = async (uri) => {
    Alert.alert(
      '영상 삭제',
      '이 영상을 보관함에서 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '삭제', 
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(uri);
              if (selectedVideo?.uri === uri) {
                setSelectedVideo(null);
              }
              loadVideos();
            } catch (e) {
              Alert.alert('오류', '영상을 삭제할 수 없습니다.');
            }
          }
        }
      ]
    );
  };

  const shareVideo = async (uri) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('알림', '이 기기에서는 공유 기능을 사용할 수 없습니다.');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const formatDate = (ts) => {
    if (!ts || isNaN(ts)) return '알 수 없음';
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderVideoItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.videoItem}
      onPress={() => setSelectedVideo(item)}
    >
      <View style={styles.videoItemIcon}>
        <FileVideo color={theme.colors.primary} size={32} />
      </View>
      <View style={styles.videoItemInfo}>
        <Text style={styles.videoItemDate}>{formatDate(item.timestamp)}</Text>
        <Text style={styles.videoItemSize}>{formatSize(item.size)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Folder color={theme.colors.primary} size={28} />
          <Text style={styles.headerTitle}>내 보관함</Text>
        </View>
        <TouchableOpacity onPress={onBack} style={styles.closeBtn}>
          <X color={theme.colors.text} size={28} />
        </TouchableOpacity>
      </View>

      {selectedVideo ? (
        <View style={styles.playerContainer}>
          <View style={styles.playerWrapper}>
            <Video
              style={StyleSheet.absoluteFillObject}
              source={{ uri: selectedVideo.uri }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping={false}
              shouldPlay={true}
            />
          </View>
          <Text style={styles.playerTitle}>녹화 일시: {formatDate(selectedVideo.timestamp)}</Text>
          
          <View style={styles.playerActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setSelectedVideo(null)}>
              <Text style={styles.actionBtnText}>목록으로</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={() => onAnalyzeVideo(selectedVideo.uri)}>
              <Play color={theme.colors.background} size={20} />
              <Text style={[styles.actionBtnText, { color: theme.colors.background }]}>AI 분석하기</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.playerSecondaryActions}>
            <TouchableOpacity style={styles.iconActionBtn} onPress={() => shareVideo(selectedVideo.uri)}>
              <Share2 color={theme.colors.text} size={24} />
              <Text style={styles.iconActionText}>내보내기</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.iconActionBtn} onPress={() => deleteVideo(selectedVideo.uri)}>
              <Trash2 color={theme.colors.secondary} size={24} />
              <Text style={[styles.iconActionText, { color: theme.colors.secondary }]}>삭제</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {videos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Folder color={theme.colors.textMuted} size={64} style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>저장된 영상이 없습니다.</Text>
              <Text style={styles.emptySubText}>[실시간 측정]을 통해 수영 영상을 기록해보세요.</Text>
            </View>
          ) : (
            <FlatList
              data={videos}
              keyExtractor={(item) => item.id}
              renderItem={renderVideoItem}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: theme.borderRadius.round,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  videoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  videoItemIcon: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  videoItemInfo: {
    flex: 1,
  },
  videoItemDate: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoItemSize: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  
  // Player Styles
  playerContainer: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  playerWrapper: {
    width: '100%',
    aspectRatio: 9/16, // Assuming vertical video, typical for phones
    backgroundColor: '#000',
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  playerTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  playerActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    borderColor: theme.colors.primary,
  },
  actionBtnText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerSecondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: theme.spacing.lg,
  },
  iconActionBtn: {
    alignItems: 'center',
    gap: 8,
  },
  iconActionText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '500',
  }
});
