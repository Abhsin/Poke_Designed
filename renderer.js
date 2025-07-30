const { ipcRenderer } = require('electron');

// Window control functions using ipcRenderer
function minimizeWindow() {
    ipcRenderer.send('window-control', 'minimize');
}

function maximizeWindow() {
    ipcRenderer.send('window-control', 'maximize');
}

function closeWindow() {
    ipcRenderer.send('window-control', 'close');
}

// Window control buttons
document.getElementById('minimizeBtn').addEventListener('click', () => {
    minimizeWindow();
});

document.getElementById('maximizeBtn').addEventListener('click', () => {
    maximizeWindow();
});

document.getElementById('closeBtn').addEventListener('click', () => {
    closeWindow();
});

// Start button functionality
document.getElementById('startBtn').addEventListener('click', () => {
    console.log('Start button clicked!');
    
    // Navigate to API Keys screen
    window.location.href = 'api-keys.html';
});

// Notification function
function showNotification(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body: message });
            }
        });
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + Q to quit
    if ((event.ctrlKey || event.metaKey) && event.key === 'q') {
        closeWindow();
    }
    
    // F11 to toggle fullscreen
    if (event.key === 'F11') {
        ipcRenderer.send('window-control', 'toggle-fullscreen');
    }
    
    // Escape to exit fullscreen
    if (event.key === 'Escape') {
        ipcRenderer.send('window-control', 'exit-fullscreen');
    }
});

// Window state management
window.addEventListener('beforeunload', () => {
    // Save any app state here
    console.log('App is closing...');
});

// Add some interactive effects
const startButton = document.getElementById('startBtn');
const brandTitle = document.querySelector('.brand-title');

// Add hover effects
startButton.addEventListener('mouseenter', () => {
    brandTitle.style.transform = 'scale(1.05)';
});

startButton.addEventListener('mouseleave', () => {
    brandTitle.style.transform = 'scale(1)';
});

// Add click animation
startButton.addEventListener('click', () => {
    startButton.style.transform = 'scale(0.95)';
    setTimeout(() => {
        startButton.style.transform = 'scale(1)';
    }, 150);
});

// Auto-focus the start button for accessibility
window.addEventListener('load', () => {
    startButton.focus();
});

// Handle window resize
window.addEventListener('resize', () => {
    // Adjust layout if needed
    console.log('Window resized');
});

// Prevent context menu on right click
document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// Add smooth loading animation
document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.querySelector('.app-container');
    appContainer.style.opacity = '0';
    appContainer.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        appContainer.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        appContainer.style.opacity = '1';
        appContainer.style.transform = 'translateY(0)';
    }, 100);
});

// Handle app activation (macOS)
if (process.platform === 'darwin') {
    document.addEventListener('focus', () => {
        console.log('App activated');
    });
    
    document.addEventListener('blur', () => {
        console.log('App deactivated');
    });
} 