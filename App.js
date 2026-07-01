import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import MainScreen from './src/screens/MainScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import VideoAnalysisScreen from './src/screens/VideoAnalysisScreen';
import GalleryScreen from './src/screens/GalleryScreen';
import { theme } from './src/theme/theme';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('main'); // main, tracking, analysis, dashboard, gallery
  const [poolLength, setPoolLength] = useState(50);
  const [sessionResult, setSessionResult] = useState(null); // { data: laps or detailedData, totalTime, isAiAnalyzed }
  const [videoUri, setVideoUri] = useState(null);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    // Load API key on startup
    const loadApiKey = async () => {
      try {
        const savedKey = await AsyncStorage.getItem('@gemini_api_key');
        if (savedKey !== null) {
          setApiKey(savedKey);
        }
      } catch (e) {
        console.error('Failed to load API key', e);
      }
    };
    loadApiKey();
  }, []);

  useEffect(() => {
    if (currentScreen === 'tracking' || currentScreen === 'analysis') {
      // Allow all orientations during real-time tracking or video analysis
      ScreenOrientation.unlockAsync();
    } else {
      // Lock to portrait for main menu and dashboard
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, [currentScreen]);

  const handleSetApiKey = async (key) => {
    setApiKey(key);
    try {
      await AsyncStorage.setItem('@gemini_api_key', key);
    } catch (e) {
      console.error('Failed to save API key', e);
    }
  };

  const handleStart = (length) => {
    setPoolLength(length);
    setCurrentScreen('tracking');
  };

  const handleUpload = (length, uri) => {
    setPoolLength(length);
    setVideoUri(uri);
    setCurrentScreen('analysis');
  };

  const handleFinishTracking = (data, totalTime, isAiAnalyzed = false) => {
    setSessionResult({ data, totalTime, isAiAnalyzed });
    setCurrentScreen('dashboard');
  };

  const handleCancelTracking = () => {
    setCurrentScreen('main');
  };

  const handleReset = () => {
    setSessionResult(null);
    setCurrentScreen('main');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {currentScreen === 'main' && (
        <MainScreen 
          onStart={handleStart} 
          onUpload={handleUpload} 
          onViewGallery={() => setCurrentScreen('gallery')}
          apiKey={apiKey}
          setApiKey={handleSetApiKey}
        />
      )}
      {currentScreen === 'tracking' && (
        <TrackingScreen 
          poolLength={poolLength} 
          onFinish={handleFinishTracking} 
          onCancel={handleCancelTracking}
        />
      )}
      {currentScreen === 'analysis' && videoUri && (
        <VideoAnalysisScreen
          poolLength={poolLength}
          videoUri={videoUri}
          apiKey={apiKey}
          onFinish={handleFinishTracking}
          onCancel={handleCancelTracking}
        />
      )}
      {currentScreen === 'gallery' && (
        <GalleryScreen
          onBack={() => setCurrentScreen('main')}
          onAnalyzeVideo={(uri) => handleUpload(poolLength, uri)}
        />
      )}
      {currentScreen === 'dashboard' && sessionResult && (
        <DashboardScreen 
          data={sessionResult.data} 
          totalTime={sessionResult.totalTime}
          poolLength={poolLength}
          isAiAnalyzed={sessionResult.isAiAnalyzed}
          onReset={handleReset}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
