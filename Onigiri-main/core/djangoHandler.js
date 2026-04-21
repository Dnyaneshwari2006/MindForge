const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let djangoProcess = null;

function waitForDjango(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        return reject(new Error('Timeout waiting for Django to start'));
      }

      const req = http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          // 404 is also fine as it means the server is running but route doesn't exist
          clearInterval(interval);
          resolve();
        }
      });

      req.on('error', (err) => {
        // Expected if server is not up yet
      });
      req.end();
    }, 1000);
  });
}

async function startDjango() {
  const pwaDir = path.join(__dirname, '..', 'PWA', 'PWA 1', 'PWA2');
  
  const fs = require('fs');
  // Decide python command based on platform
  // On Windows, try 'python' first, then 'py' (Windows Python Launcher)
  let pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  if (process.platform === 'win32') {
    try {
      require('child_process').execSync('python --version', { stdio: 'ignore' });
    } catch {
      pythonCmd = 'py';  // fallback to Windows Python Launcher
    }
  }
  const venvPythonWin = path.join(pwaDir, 'venv', 'Scripts', 'python.exe');
  const venvPythonUnix = path.join(pwaDir, 'venv', 'bin', 'python');
  const rootVenvWin = path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe');
  const rootVenvUnix = path.join(__dirname, '..', 'venv', 'bin', 'python');

  if (fs.existsSync(venvPythonWin)) {
    pythonCmd = venvPythonWin;
  } else if (fs.existsSync(rootVenvWin)) {
    pythonCmd = rootVenvWin;
  } else if (fs.existsSync(venvPythonUnix)) {
    pythonCmd = venvPythonUnix;
  } else if (fs.existsSync(rootVenvUnix)) {
    pythonCmd = rootVenvUnix;
  }

  console.log(`[Django] Starting Django server at ${pwaDir}...`);
  console.log(`[Django] Using Python executable at: ${pythonCmd}`);
  
  return new Promise((resolve, reject) => {
    djangoProcess = spawn(pythonCmd, ['manage.py', 'runserver', '0.0.0.0:8000'], {
      cwd: pwaDir,
      stdio: 'pipe',
    });

    djangoProcess.on('error', (err) => {
      console.warn(`[Django] Failed to spawn Python process: ${err.message}`);
      djangoProcess = null;
      reject(new Error(`Python not found or failed to start: ${err.message}`));
    });

    djangoProcess.stdout.on('data', (data) => {
      console.log(`[Django] ${data.toString().trim()}`);
    });

    djangoProcess.stderr.on('data', (data) => {
      console.error(`[Django ERROR] ${data.toString().trim()}`);
    });

    djangoProcess.on('close', (code) => {
      console.log(`[Django] Process exited with code ${code}`);
    });

    console.log('[Django] Waiting for health check (port 8000)...');
    waitForDjango('http://localhost:8000/')
      .then(() => {
        console.log('[Django] Server is ready!');
        resolve();
      })
      .catch(reject);
  });
}

function stopDjango() {
  if (djangoProcess) {
    console.log('[Django] Shutting down Django server...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', djangoProcess.pid, '/f', '/t']);
    } else {
      djangoProcess.kill('SIGTERM');
    }
  }
}

module.exports = { startDjango, stopDjango };
