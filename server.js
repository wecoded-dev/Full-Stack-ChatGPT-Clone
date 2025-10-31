import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cluster from 'cluster';
import os from 'os';
import redis from 'redis';
import winston from 'winston';
import morgan from 'morgan';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import userAgent from 'express-useragent';
import apicache from 'apicache';
import './config/env.js';

// Import routes and middleware
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import paymentRoutes from './routes/payments.js';
import fileRoutes from './routes/files.js';
import analyticsRoutes from './routes/analytics.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { securityMiddleware } from './middleware/security.js';
import { performanceMiddleware } from './middleware/performance.js';

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Redis client for caching and sessions
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
await redisClient.connect();

// Cluster mode for production
if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
  const numCPUs = os.cpus().length;
  logger.info(`Primary ${process.pid} is running`);
  logger.info(`Forking for ${numCPUs} CPUs`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Restart worker
  });
} else {
  const app = express();
  const server = http.createServer(app);
  
  // Enhanced Socket.io with Redis adapter for scaling
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URLS?.split(',') || ["http://localhost:3000"],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true
    },
    adapter: require('socket.io-redis')({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    })
  });

  // Enhanced middleware stack
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  app.use(compression({
    level: 6,
    threshold: 100 * 1024 // Compress responses over 100KB
  }));

  app.use(cors({
    origin: function(origin, callback) {
      const allowedOrigins = process.env.CLIENT_URLS?.split(',') || [
        'http://localhost:3000',
        'https://yourdomain.com'
      ];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Rate limiting with Redis store
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests from this IP, please try again later.'
    },
    skip: (req) => {
      // Skip rate limiting for certain paths or in development
      if (process.env.NODE_ENV === 'development') return true;
      if (req.path.includes('/health')) return true;
      return false;
    }
  });

  app.use(limiter);

  // Enhanced session management
  app.use(session({
    secret: process.env.SESSION_SECRET || 'ultra-secret-session-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    store: new (require('connect-redis')(session))({ client: redisClient })
  }));

  app.use(cookieParser());
  app.use(userAgent.express());
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

  // Body parsing with limits
  app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '50mb' 
  }));

  // Security middleware
  app.use(securityMiddleware);

  // Performance middleware
  app.use(performanceMiddleware);

  // Cache middleware for GET requests
  const cache = apicache.middleware;
  app.use(cache('5 minutes', (req, res) => req.method === 'GET' && res.statusCode === 200));

  // Database connection with retry logic
  const connectDB = async (retries = 5) => {
    while (retries) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          retryWrites: true,
          w: 'majority'
        });
        logger.info('Connected to MongoDB');
        break;
      } catch (error) {
        logger.error(`MongoDB connection failed. Retries left: ${retries}`, error);
        retries -= 1;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  };

  await connectDB();

  // Health check endpoint
  app.get('/health', async (req, res) => {
    const healthcheck = {
      uptime: process.uptime(),
      message: 'OK',
      timestamp: Date.now(),
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisClient.isOpen ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV,
      memory: process.memoryUsage(),
      version: process.version
    };

    try {
      res.status(200).json(healthcheck);
    } catch (error) {
      healthcheck.message = error;
      res.status(503).json(healthcheck);
    }
  });

  // API Routes with versioning
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/chat', chatRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/files', fileRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);

  // Webhook endpoints (must be before error handling)
  app.use('/webhooks/stripe', require('./webhooks/stripe.js'));

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('client/build'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
    });
  }

  // Error handling
  app.use(notFound);
  app.use(errorHandler);

  // Socket.io configuration
  require('./sockets/chatSocket.js')(io);
  require('./sockets/adminSocket.js')(io);

  const PORT = process.env.PORT || 5000;
  
  server.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    logger.info(`Worker ${process.pid} started`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, starting graceful shutdown');
    server.close(() => {
      mongoose.connection.close(false, () => {
        redisClient.quit();
        logger.info('Process terminated');
        process.exit(0);
      });
    });
  });
}
