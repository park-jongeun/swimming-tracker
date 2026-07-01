import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { theme } from '../theme/theme';
import { Folder, Film, Trash2, ArrowLeft, Plus } from 'lucide-react-native';
import { StorageService } from '../services/StorageService';

export default function LibraryScreen({ onBack, onViewRecord }) {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      loadRecords(selectedFolder.id);
    }
  }, [selectedFolder]);

  const loadFolders = async () => {
    const f = await StorageService.getFolders();
    setFolders(f);
  };

  const loadRecords = async (folderId) => {
    const r = await StorageService.getRecordsByFolder(folderId);
    setRecords(r);
  };

  const handleDeleteFolder = (folder) => {
    Alert.alert(
      "폴더 삭제",
      `'${folder.name}' 폴더와 그 안의 모든 영상을 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        { 
          text: "삭제", 
          style: "destructive",
          onPress: async () => {
            await StorageService.deleteFolder(folder.id);
            loadFolders();
            if (selectedFolder?.id === folder.id) {
              setSelectedFolder(null);
            }
          }
        }
      ]
    );
  };

  const handleDeleteRecord = (record) => {
    Alert.alert(
      "기록 삭제",
      "이 영상과 분석 기록을 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { 
          text: "삭제", 
          style: "destructive",
          onPress: async () => {
            await StorageService.deleteRecord(record.id);
            loadRecords(selectedFolder.id);
          }
        }
      ]
    );
  };

  const renderFolder = ({ item }) => (
    <TouchableOpacity style={styles.folderCard} onPress={() => setSelectedFolder(item)}>
      <View style={styles.folderHeader}>
        <Folder color={theme.colors.primary} size={32} />
        <TouchableOpacity onPress={() => handleDeleteFolder(item)}>
          <Trash2 color={theme.colors.error} size={20} />
        </TouchableOpacity>
      </View>
      <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.folderDate}>
        {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  const renderRecord = ({ item }) => {
    const distance = item.isAiAnalyzed ? item.poolLength : item.data.length * item.poolLength;
    return (
      <TouchableOpacity style={styles.recordCard} onPress={() => onViewRecord(item)}>
        <View style={styles.recordIcon}>
          <Film color={theme.colors.secondary} size={24} />
        </View>
        <View style={styles.recordInfo}>
          <Text style={styles.recordTitle}>{item.title}</Text>
          <Text style={styles.recordSub}>
            {distance}m • {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteRecord(item)} style={styles.recordDelete}>
          <Trash2 color={theme.colors.error} size={20} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (selectedFolder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedFolder(null)} style={styles.backBtn}>
            <ArrowLeft color={theme.colors.text} size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedFolder.name}</Text>
          <View style={{ width: 24 }} />
        </View>
        <FlatList
          key="records-list"
          data={records}
          keyExtractor={item => item.id}
          renderItem={renderRecord}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>저장된 기록이 없습니다.</Text>}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft color={theme.colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>라이브러리</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        key="folders-list"
        data={folders}
        keyExtractor={item => item.id}
        renderItem={renderFolder}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>생성된 폴더가 없습니다.</Text>}
      />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: theme.spacing.sm,
    marginLeft: -theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  row: {
    justifyContent: 'space-between',
  },
  folderCard: {
    backgroundColor: theme.colors.surface,
    width: '48%',
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  folderName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  folderDate: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  recordCard: {
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recordIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  recordInfo: {
    flex: 1,
  },
  recordTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  recordSub: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  recordDelete: {
    padding: theme.spacing.sm,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    fontSize: 16,
  }
});
