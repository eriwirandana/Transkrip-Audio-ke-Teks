import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Paper,
  Avatar,
  Alert,
  Skeleton
} from '@mui/material';
import {
  Upload as UploadIcon,
  AudioFile as AudioFileIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Assessment as AssessmentIcon,
  AccessTime as TimeIcon,
  Group as GroupIcon,
  Mic as MicIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Queue as QueueIcon
} from '@mui/icons-material';
import { useSocket } from '../contexts/SocketContext';
import { useProject } from '../contexts/ProjectContext';
import UploadDialog from '../components/UploadDialog';
import ProgressCard from '../components/ProgressCard';
import ProjectCard from '../components/ProjectCard';
import StatsCard from '../components/StatsCard';
import { formatDuration, formatFileSize, formatDate } from '../utils/formatters';

const Dashboard = ({ showNotification }) => {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalHours: 0,
    totalFiles: 0,
    completedToday: 0
  });
  const [loading, setLoading] = useState(true);

  const socket = useSocket();
  const { projects, refreshProjects } = useProject();

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (socket) {
      // Listen for job updates
      socket.on('job-queued', handleJobQueued);
      socket.on('job-progress', handleJobProgress);
      socket.on('job-completed', handleJobCompleted);
      socket.on('job-failed', handleJobFailed);

      return () => {
        socket.off('job-queued');
        socket.off('job-progress');
        socket.off('job-completed');
        socket.off('job-failed');
      };
    }
  }, [socket]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load recent projects
      await refreshProjects();
      
      // Load active jobs
      const jobsResponse = await fetch('/api/transcription/active');
      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json();
        setActiveJobs(jobsData.data || []);
      }

      // Load dashboard stats
      const statsResponse = await fetch('/api/dashboard/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.data || stats);
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      showNotification('Gagal memuat data dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJobQueued = (data) => {
    setActiveJobs(prev => [...prev, {
      id: data.jobId,
      status: 'queued',
      progress: 0,
      queuePosition: data.queuePosition
    }]);
    showNotification('File ditambahkan ke antrian transkripsi', 'success');
  };

  const handleJobProgress = (data) => {
    setActiveJobs(prev => prev.map(job => 
      job.id === data.jobId 
        ? { ...job, ...data, status: 'processing' }
        : job
    ));
  };

  const handleJobCompleted = (data) => {
    setActiveJobs(prev => prev.filter(job => job.id !== data.jobId));
    refreshProjects();
    showNotification('Transkripsi selesai!', 'success');
    
    // Update stats
    setStats(prev => ({
      ...prev,
      completedToday: prev.completedToday + 1
    }));
  };

  const handleJobFailed = (data) => {
    setActiveJobs(prev => prev.map(job => 
      job.id === data.jobId 
        ? { ...job, status: 'failed', error: data.error }
        : job
    ));
    showNotification(`Transkripsi gagal: ${data.error}`, 'error');
  };

  const getRecentProjects = () => {
    return projects
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5);
  };

  const getJobStatusColor = (status) => {
    switch (status) {
      case 'queued': return 'warning';
      case 'processing': return 'info';
      case 'completed': return 'success';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getJobStatusIcon = (status) => {
    switch (status) {
      case 'queued': return <QueueIcon />;
      case 'processing': return <MicIcon />;
      case 'completed': return <CheckCircleIcon />;
      case 'failed': return <ErrorIcon />;
      default: return <TimeIcon />;
    }
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {/* Loading skeleton */}
          {[...Array(8)].map((_, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="rectangular" height={60} sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Dashboard Transkripsi Audio
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Selamat datang di aplikasi transkripsi audio bahasa Indonesia untuk penelitian akademis
        </Typography>
      </Box>

      {/* Quick Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Proyek"
            value={stats.totalProjects}
            icon={<AssessmentIcon />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Jam Audio"
            value={Math.round(stats.totalHours)} 
            suffix=" jam"
            icon={<TimeIcon />}
            color="secondary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="File Diproses"
            value={stats.totalFiles}
            icon={<AudioFileIcon />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Selesai Hari Ini"
            value={stats.completedToday}
            icon={<CheckCircleIcon />}
            color="success"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Upload Section */}
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ 
                textAlign: 'center', 
                py: 6,
                border: '2px dashed',
                borderColor: 'primary.main',
                borderRadius: 2,
                cursor: 'pointer',
                '&:hover': {
                  backgroundColor: 'action.hover'
                }
              }}
              onClick={() => setUploadDialogOpen(true)}
              >
                <UploadIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  Upload File Audio
                </Typography>
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  Drag & drop file audio atau klik untuk memilih file
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Format yang didukung: MP3, WAV, M4A, OGG, FLAC, AAC (Max 500MB)
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<UploadIcon />}
                  sx={{ mt: 2 }}
                  size="large"
                >
                  Pilih File Audio
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Active Jobs */}
          {activeJobs.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Proses Transkripsi Aktif
                </Typography>
                <List>
                  {activeJobs.map((job, index) => (
                    <React.Fragment key={job.id}>
                      <ListItem>
                        <ListItemIcon>
                          <Avatar sx={{ 
                            bgcolor: `${getJobStatusColor(job.status)}.main`,
                            width: 32,
                            height: 32
                          }}>
                            {getJobStatusIcon(job.status)}
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText
                          primary={job.filename || `Job ${job.id}`}
                          secondary={
                            <Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Chip 
                                  label={job.status === 'queued' ? 'Antrian' : 
                                        job.status === 'processing' ? 'Memproses' : 
                                        job.status === 'failed' ? 'Gagal' : job.status}
                                  color={getJobStatusColor(job.status)}
                                  size="small"
                                />
                                {job.stage && (
                                  <Typography variant="caption" color="text.secondary">
                                    {job.stage}
                                  </Typography>
                                )}
                              </Box>
                              {job.status === 'processing' && (
                                <Box>
                                  <LinearProgress 
                                    variant="determinate" 
                                    value={job.overallProgress || 0}
                                    sx={{ mb: 1 }}
                                  />
                                  <Typography variant="caption" color="text.secondary">
                                    {job.overallProgress || 0}% selesai
                                    {job.estimatedTimeRemaining && (
                                      ` • ${Math.round(job.estimatedTimeRemaining / 60)} menit tersisa`
                                    )}
                                  </Typography>
                                </Box>
                              )}
                              {job.status === 'failed' && job.error && (
                                <Typography variant="caption" color="error">
                                  Error: {job.error}
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                      {index < activeJobs.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}

          {/* Recent Projects */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Proyek Terbaru
                </Typography>
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => window.location.href = '/projects'}
                >
                  Lihat Semua
                </Button>
              </Box>
              
              {getRecentProjects().length === 0 ? (
                <Alert severity="info">
                  Belum ada proyek. Mulai dengan mengupload file audio pertama Anda!
                </Alert>
              ) : (
                <List>
                  {getRecentProjects().map((project, index) => (
                    <React.Fragment key={project.id}>
                      <ListItem
                        sx={{ 
                          cursor: 'pointer',
                          '&:hover': { backgroundColor: 'action.hover' }
                        }}
                        onClick={() => window.location.href = `/editor/${project.id}`}
                      >
                        <ListItemIcon>
                          <AudioFileIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary={project.title || project.filename}
                          secondary={
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(project.updatedAt)} • {formatDuration(project.duration)}
                                {project.speakers && ` • ${project.speakers.length} pembicara`}
                              </Typography>
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton 
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `/editor/${project.id}`;
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton 
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle download
                              }}
                            >
                              <DownloadIcon />
                            </IconButton>
                          </Box>
                        </ListItemSecondaryAction>
                      </ListItem>
                      {index < getRecentProjects().length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Quick Actions */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Aksi Cepat
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<UploadIcon />}
                  fullWidth
                  onClick={() => setUploadDialogOpen(true)}
                >
                  Upload Audio Baru
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AssessmentIcon />}
                  fullWidth
                  onClick={() => window.location.href = '/projects'}
                >
                  Kelola Proyek
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  fullWidth
                  onClick={() => window.location.href = '/exports'}
                >
                  Export & Download
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Tips & Info */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Tips Transkripsi
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <MicIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Kualitas Audio"
                    secondary="Gunakan audio berkualitas tinggi untuk hasil terbaik (minimal 16kHz)"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <GroupIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Pembicara Jelas"
                    secondary="Pastikan setiap pembicara terdengar jelas untuk deteksi speaker yang akurat"
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <TimeIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Durasi Optimal"
                    secondary="File 30-60 menit memberikan hasil optimal. File lebih panjang akan dipecah otomatis"
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploadSuccess={(data) => {
          showNotification('File berhasil diupload!', 'success');
          loadDashboardData();
        }}
        showNotification={showNotification}
      />
    </Container>
  );
};

export default Dashboard;