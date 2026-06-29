import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import healthRouter from './routes/health';
import gameRouter from './routes/game';
import playerRouter from './routes/player';
import analyticsRouter from './routes/analytics';
import configRouter from './routes/config';
import { injectTier } from './middleware/tierMiddleware';
import { injectTenantContext, logTenantConfiguration } from './middleware/tenantContextMiddleware';

// Configuration from environment variables
const PORT = parseInt(process.env.PORT || '8080', 10);
const NODE_ENV = process.env.NODE_ENV || 'production';

// Create Express application
const app: Application = express();

// Middleware configuration
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Inject tenant context from environment variable
app.use(injectTenantContext);

// Inject tenant tier from environment variable
app.use(injectTier);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../src/public')));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/health', healthRouter);
app.use('/api/game', gameRouter);
app.use('/api/player', playerRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/config', configRouter);

// Root route - serve game UI
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../src/public/index.html'));
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
let server: any;

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      server = app.listen(PORT, () => {
        console.log(`🎮 Gaming application server started`);
        console.log(`📍 Port: ${PORT}`);
        console.log(`🌍 Environment: ${NODE_ENV}`);
        console.log(`🏥 Health check: http://localhost:${PORT}/health`);
        
        // Log tenant configuration
        logTenantConfiguration();
        
        resolve();
      });

      server.on('error', (error: Error) => {
        console.error('Failed to start server:', error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Graceful shutdown handler
function shutdown(): void {
  console.log('Received shutdown signal, initiating graceful shutdown...');
  
  if (server) {
    // Stop accepting new connections
    server.close((err?: Error) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      
      console.log('Server closed successfully');
      
      // Clean up AWS client connections
      // Note: AWS SDK v3 clients don't require explicit cleanup,
      // but we log the shutdown for observability
      console.log('AWS client connections cleaned up');
      
      console.log('Graceful shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 30 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  } else {
    console.log('No active server to close');
    process.exit(0);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { app, startServer, shutdown };

