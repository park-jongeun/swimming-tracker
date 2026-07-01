import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const FOLDERS_KEY = '@folders';
const RECORDS_KEY = '@records';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export const StorageService = {
  // --- Folders ---
  async getFolders() {
    try {
      const foldersStr = await AsyncStorage.getItem(FOLDERS_KEY);
      return foldersStr ? JSON.parse(foldersStr) : [];
    } catch (e) {
      console.error('Failed to get folders', e);
      return [];
    }
  },

  async createFolder(name) {
    try {
      const folders = await this.getFolders();
      const newFolder = {
        id: generateId(),
        name,
        createdAt: Date.now(),
      };
      folders.push(newFolder);
      await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
      return newFolder;
    } catch (e) {
      console.error('Failed to create folder', e);
      throw e;
    }
  },

  async deleteFolder(folderId) {
    try {
      let folders = await this.getFolders();
      folders = folders.filter(f => f.id !== folderId);
      await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
      
      // Also delete all records inside this folder
      let records = await this.getAllRecords();
      const recordsToDelete = records.filter(r => r.folderId === folderId);
      
      // Delete local video files for these records
      for (const record of recordsToDelete) {
        if (record.videoUri) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(record.videoUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(record.videoUri);
            }
          } catch (err) {
            console.error('Error deleting local video file', err);
          }
        }
      }

      records = records.filter(r => r.folderId !== folderId);
      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      return true;
    } catch (e) {
      console.error('Failed to delete folder', e);
      throw e;
    }
  },

  // --- Records ---
  async getAllRecords() {
    try {
      const recordsStr = await AsyncStorage.getItem(RECORDS_KEY);
      return recordsStr ? JSON.parse(recordsStr) : [];
    } catch (e) {
      console.error('Failed to get records', e);
      return [];
    }
  },

  async getRecordsByFolder(folderId) {
    try {
      const records = await this.getAllRecords();
      return records.filter(r => r.folderId === folderId).sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Failed to get records by folder', e);
      return [];
    }
  },

  async saveRecord({ folderId, title, originalVideoUri, data, totalTime, poolLength, isAiAnalyzed }) {
    try {
      let localVideoUri = null;
      
      // Copy video to app's document directory if it exists
      if (originalVideoUri) {
        const fileExt = originalVideoUri.split('.').pop() || 'mp4';
        const fileName = `video_${generateId()}.${fileExt}`;
        localVideoUri = `${FileSystem.documentDirectory}${fileName}`;
        
        await FileSystem.copyAsync({
          from: originalVideoUri,
          to: localVideoUri
        });
      }

      const records = await this.getAllRecords();
      const newRecord = {
        id: generateId(),
        folderId,
        title: title || '새 분석 기록',
        videoUri: localVideoUri,
        data,
        totalTime,
        poolLength,
        isAiAnalyzed,
        createdAt: Date.now(),
      };
      
      records.push(newRecord);
      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      return newRecord;
    } catch (e) {
      console.error('Failed to save record', e);
      throw e;
    }
  },

  async deleteRecord(recordId) {
    try {
      let records = await this.getAllRecords();
      const recordToDelete = records.find(r => r.id === recordId);
      
      if (recordToDelete && recordToDelete.videoUri) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(recordToDelete.videoUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(recordToDelete.videoUri);
          }
        } catch (err) {
          console.error('Error deleting local video file', err);
        }
      }

      records = records.filter(r => r.id !== recordId);
      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      return true;
    } catch (e) {
      console.error('Failed to delete record', e);
      throw e;
    }
  }
};
