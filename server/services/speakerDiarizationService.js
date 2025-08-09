const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { spawn } = require('child_process');

class SpeakerDiarizationService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'speaker-diarization' },
      transports: [
        new winston.transports.File({ filename: 'logs/diarization.log' }),
        new winston.transports.Console()
      ]
    });
  }

  async process(audioPath, transcriptionResult, options = {}, progressCallback = null) {
    try {
      this.logger.info(`Starting speaker diarization: ${audioPath}`);
      
      if (progressCallback) progressCallback(5);
      
      // For now, we'll implement a simple clustering-based approach
      // In production, you might want to use services like:
      // - Assembly AI Speaker Diarization
      // - Google Speech-to-Text with speaker diarization
      // - Pyannote.audio (Python library that can be called via subprocess)
      
      const diarizationResult = await this.performSimpleDiarization(
        audioPath, 
        transcriptionResult, 
        options,
        progressCallback
      );
      
      if (progressCallback) progressCallback(100);
      
      this.logger.info(`Speaker diarization completed: ${diarizationResult.speakers.length} speakers detected`);
      
      return diarizationResult;
      
    } catch (error) {
      this.logger.error('Speaker diarization failed:', error);
      throw new Error(`Speaker diarization failed: ${error.message}`);
    }
  }

  async performSimpleDiarization(audioPath, transcriptionResult, options, progressCallback) {
    const segments = transcriptionResult.segments || [];
    
    if (progressCallback) progressCallback(20);
    
    // Extract audio features for clustering
    const features = await this.extractAudioFeatures(audioPath, segments, progressCallback);
    
    if (progressCallback) progressCallback(60);
    
    // Perform speaker clustering
    const speakerClusters = this.clusterSpeakers(features, options);
    
    if (progressCallback) progressCallback(80);
    
    // Assign speakers to segments
    const diarizedSegments = this.assignSpeakersToSegments(segments, speakerClusters);
    
    if (progressCallback) progressCallback(90);
    
    // Generate speaker profiles
    const speakers = this.generateSpeakerProfiles(speakerClusters, diarizedSegments);
    
    return {
      duration: transcriptionResult.duration,
      speakers: speakers,
      segments: diarizedSegments,
      metadata: {
        method: 'simple-clustering',
        numSpeakers: speakers.length,
        confidenceThreshold: options.confidenceThreshold || 0.7
      }
    };
  }

  async extractAudioFeatures(audioPath, segments, progressCallback) {
    // This is a simplified approach. In production, you would:
    // 1. Extract MFCC features
    // 2. Use pre-trained speaker embedding models
    // 3. Calculate voice activity detection
    
    const features = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Simple features based on segment characteristics
      const feature = {
        segmentId: segment.id,
        duration: segment.end - segment.start,
        textLength: segment.text.length,
        avgWordDuration: this.calculateAverageWordDuration(segment),
        pausesBefore: this.calculatePausesBefore(segments, i),
        speechRate: this.calculateSpeechRate(segment),
        // In real implementation, these would be actual audio features
        pitch: Math.random() * 100 + 100, // Simulated pitch
        energy: Math.random() * 50 + 25,   // Simulated energy
        spectralCentroid: Math.random() * 1000 + 500 // Simulated spectral features
      };
      
      features.push(feature);
      
      if (progressCallback) {
        const progress = 20 + (i / segments.length) * 40;
        progressCallback(progress);
      }
    }
    
    return features;
  }

  clusterSpeakers(features, options) {
    const numSpeakers = options.numSpeakers;
    const minSpeakers = options.minSpeakers || 2;
    const maxSpeakers = options.maxSpeakers || 6;
    
    let finalClusters;
    
    if (numSpeakers === 'auto') {
      // Try different numbers of clusters and pick the best one
      finalClusters = this.findOptimalClusters(features, minSpeakers, maxSpeakers);
    } else {
      finalClusters = this.kMeansClustering(features, parseInt(numSpeakers));
    }
    
    return finalClusters;
  }

  findOptimalClusters(features, minK, maxK) {
    let bestClusters = null;
    let bestScore = -Infinity;
    
    for (let k = minK; k <= maxK; k++) {
      const clusters = this.kMeansClustering(features, k);
      const score = this.evaluateClusterQuality(clusters, features);
      
      if (score > bestScore) {
        bestScore = score;
        bestClusters = clusters;
      }
    }
    
    return bestClusters || this.kMeansClustering(features, 2);
  }

  kMeansClustering(features, k) {
    const maxIterations = 100;
    const tolerance = 0.001;
    
    // Initialize centroids randomly
    let centroids = this.initializeCentroids(features, k);
    let assignments = new Array(features.length);
    
    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;
      
      // Assign points to nearest centroid
      for (let i = 0; i < features.length; i++) {
        const nearestCentroid = this.findNearestCentroid(features[i], centroids);
        if (assignments[i] !== nearestCentroid) {
          assignments[i] = nearestCentroid;
          changed = true;
        }
      }
      
      // Update centroids
      const newCentroids = this.updateCentroids(features, assignments, k);
      
      // Check for convergence
      if (!changed || this.centroidsConverged(centroids, newCentroids, tolerance)) {
        break;
      }
      
      centroids = newCentroids;
    }
    
    // Create cluster objects
    const clusters = [];
    for (let i = 0; i < k; i++) {
      const clusterFeatures = features.filter((_, idx) => assignments[idx] === i);
      clusters.push({
        id: i,
        centroid: centroids[i],
        features: clusterFeatures,
        size: clusterFeatures.length
      });
    }
    
    return clusters;
  }

  initializeCentroids(features, k) {
    const centroids = [];
    const featureKeys = ['duration', 'speechRate', 'pitch', 'energy', 'spectralCentroid'];
    
    for (let i = 0; i < k; i++) {
      const centroid = {};
      featureKeys.forEach(key => {
        const values = features.map(f => f[key]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        centroid[key] = min + Math.random() * (max - min);
      });
      centroids.push(centroid);
    }
    
    return centroids;
  }

  findNearestCentroid(feature, centroids) {
    let nearestIndex = 0;
    let minDistance = this.calculateDistance(feature, centroids[0]);
    
    for (let i = 1; i < centroids.length; i++) {
      const distance = this.calculateDistance(feature, centroids[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }
    
    return nearestIndex;
  }

  calculateDistance(feature1, feature2) {
    const featureKeys = ['duration', 'speechRate', 'pitch', 'energy', 'spectralCentroid'];
    let sumSquaredDiffs = 0;
    
    featureKeys.forEach(key => {
      const diff = feature1[key] - feature2[key];
      sumSquaredDiffs += diff * diff;
    });
    
    return Math.sqrt(sumSquaredDiffs);
  }

  updateCentroids(features, assignments, k) {
    const newCentroids = [];
    const featureKeys = ['duration', 'speechRate', 'pitch', 'energy', 'spectralCentroid'];
    
    for (let i = 0; i < k; i++) {
      const clusterFeatures = features.filter((_, idx) => assignments[idx] === i);
      
      if (clusterFeatures.length === 0) {
        // Keep the old centroid if no points assigned
        newCentroids.push(this.initializeCentroids(features, 1)[0]);
        continue;
      }
      
      const centroid = {};
      featureKeys.forEach(key => {
        const sum = clusterFeatures.reduce((acc, f) => acc + f[key], 0);
        centroid[key] = sum / clusterFeatures.length;
      });
      
      newCentroids.push(centroid);
    }
    
    return newCentroids;
  }

  centroidsConverged(oldCentroids, newCentroids, tolerance) {
    for (let i = 0; i < oldCentroids.length; i++) {
      const distance = this.calculateDistance(oldCentroids[i], newCentroids[i]);
      if (distance > tolerance) {
        return false;
      }
    }
    return true;
  }

  evaluateClusterQuality(clusters, features) {
    // Silhouette score calculation
    let totalSilhouette = 0;
    let totalPoints = 0;
    
    clusters.forEach((cluster, clusterIdx) => {
      cluster.features.forEach(feature => {
        const a = this.averageIntraClusterDistance(feature, cluster);
        const b = this.nearestClusterDistance(feature, clusters, clusterIdx);
        
        const silhouette = b !== 0 ? (b - a) / Math.max(a, b) : 0;
        totalSilhouette += silhouette;
        totalPoints++;
      });
    });
    
    return totalPoints > 0 ? totalSilhouette / totalPoints : 0;
  }

  averageIntraClusterDistance(feature, cluster) {
    if (cluster.features.length <= 1) return 0;
    
    let totalDistance = 0;
    let count = 0;
    
    cluster.features.forEach(otherFeature => {
      if (otherFeature.segmentId !== feature.segmentId) {
        totalDistance += this.calculateDistance(feature, otherFeature);
        count++;
      }
    });
    
    return count > 0 ? totalDistance / count : 0;
  }

  nearestClusterDistance(feature, clusters, excludeClusterIdx) {
    let minDistance = Infinity;
    
    clusters.forEach((cluster, clusterIdx) => {
      if (clusterIdx !== excludeClusterIdx) {
        cluster.features.forEach(otherFeature => {
          const distance = this.calculateDistance(feature, otherFeature);
          minDistance = Math.min(minDistance, distance);
        });
      }
    });
    
    return minDistance === Infinity ? 0 : minDistance;
  }

  assignSpeakersToSegments(segments, clusters) {
    const diarizedSegments = segments.map(segment => ({
      ...segment,
      speaker: null,
      speakerConfidence: 0
    }));
    
    // Find which cluster each segment belongs to
    clusters.forEach((cluster, clusterIdx) => {
      cluster.features.forEach(feature => {
        const segment = diarizedSegments.find(s => s.id === feature.segmentId);
        if (segment) {
          segment.speaker = `speaker_${clusterIdx + 1}`;
          segment.speakerConfidence = this.calculateSpeakerConfidence(feature, cluster);
        }
      });
    });
    
    // Post-process to smooth speaker transitions
    this.smoothSpeakerTransitions(diarizedSegments);
    
    return diarizedSegments;
  }

  calculateSpeakerConfidence(feature, cluster) {
    const distanceToCentroid = this.calculateDistance(feature, cluster.centroid);
    const avgDistance = cluster.features.reduce((sum, f) => 
      sum + this.calculateDistance(f, cluster.centroid), 0
    ) / cluster.features.length;
    
    // Confidence is inversely related to distance from centroid
    const confidence = Math.max(0, 1 - (distanceToCentroid / (avgDistance * 2)));
    return Math.min(1, confidence);
  }

  smoothSpeakerTransitions(segments) {
    // Apply simple smoothing: if a segment is surrounded by segments from the same speaker,
    // and it's very short, assign it to the surrounding speaker
    
    for (let i = 1; i < segments.length - 1; i++) {
      const current = segments[i];
      const previous = segments[i - 1];
      const next = segments[i + 1];
      
      if (
        previous.speaker === next.speaker &&
        current.speaker !== previous.speaker &&
        (current.end - current.start) < 2.0 && // Less than 2 seconds
        current.speakerConfidence < 0.8
      ) {
        current.speaker = previous.speaker;
        current.speakerConfidence = 0.6; // Moderate confidence for reassigned
      }
    }
  }

  generateSpeakerProfiles(clusters, diarizedSegments) {
    const speakers = clusters.map((cluster, index) => {
      const speakerId = `speaker_${index + 1}`;
      const speakerSegments = diarizedSegments.filter(s => s.speaker === speakerId);
      
      const totalSpeakingTime = speakerSegments.reduce((sum, seg) => 
        sum + (seg.end - seg.start), 0
      );
      
      const avgConfidence = speakerSegments.length > 0 ?
        speakerSegments.reduce((sum, seg) => sum + seg.speakerConfidence, 0) / speakerSegments.length :
        0;
      
      return {
        id: speakerId,
        name: `Speaker ${index + 1}`,
        color: this.generateSpeakerColor(index),
        segments: speakerSegments.length,
        speakingTime: totalSpeakingTime,
        avgConfidence: avgConfidence,
        characteristics: {
          avgPitch: cluster.centroid.pitch,
          avgEnergy: cluster.centroid.energy,
          avgSpeechRate: cluster.centroid.speechRate
        }
      };
    });
    
    return speakers;
  }

  generateSpeakerColor(index) {
    const colors = [
      '#1976D2', // Blue
      '#388E3C', // Green
      '#F57C00', // Orange
      '#7B1FA2', // Purple
      '#C62828', // Red
      '#00796B', // Teal
      '#5D4037', // Brown
      '#455A64'  // Blue Grey
    ];
    
    return colors[index % colors.length];
  }

  calculateAverageWordDuration(segment) {
    if (!segment.words || segment.words.length === 0) {
      return (segment.end - segment.start) / (segment.text.split(' ').length || 1);
    }
    
    const totalDuration = segment.words.reduce((sum, word) => 
      sum + (word.end - word.start), 0
    );
    
    return totalDuration / segment.words.length;
  }

  calculatePausesBefore(segments, currentIndex) {
    if (currentIndex === 0) return 0;
    
    const current = segments[currentIndex];
    const previous = segments[currentIndex - 1];
    
    return Math.max(0, current.start - previous.end);
  }

  calculateSpeechRate(segment) {
    const duration = segment.end - segment.start;
    const wordCount = segment.words ? segment.words.length : segment.text.split(' ').length;
    
    return duration > 0 ? wordCount / duration : 0; // words per second
  }

  // Method to use external diarization services (for future implementation)
  async useExternalDiarization(audioPath, service = 'assemblyai') {
    switch (service) {
      case 'assemblyai':
        return await this.useAssemblyAIDiarization(audioPath);
      case 'google':
        return await this.useGoogleDiarization(audioPath);
      case 'pyannote':
        return await this.usePyannoteDiarization(audioPath);
      default:
        throw new Error(`Unsupported diarization service: ${service}`);
    }
  }

  async useAssemblyAIDiarization(audioPath) {
    // Implementation for Assembly AI speaker diarization
    // Requires Assembly AI API key
    throw new Error('Assembly AI diarization not implemented yet');
  }

  async useGoogleDiarization(audioPath) {
    // Implementation for Google Cloud Speech-to-Text diarization
    // Requires Google Cloud credentials
    throw new Error('Google diarization not implemented yet');
  }

  async usePyannoteDiarization(audioPath) {
    // Implementation for Pyannote.audio via Python subprocess
    // Requires Python environment with pyannote.audio installed
    throw new Error('Pyannote diarization not implemented yet');
  }
}

module.exports = SpeakerDiarizationService;