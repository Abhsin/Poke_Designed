# Poke Electron App

A beautiful Electron desktop application based on a Figma design, featuring a modern dark theme with smooth animations and custom window controls.

## Features

- 🎨 **Modern Dark Theme** - Beautiful dark UI matching the Figma design
- 🖼️ **Custom Window Controls** - Minimize, maximize, and close buttons
- ✨ **Smooth Animations** - Floating logo animation and hover effects
- 🎯 **Responsive Design** - Adapts to different window sizes
- ⌨️ **Keyboard Shortcuts** - Quick access to common actions
- 🔔 **Desktop Notifications** - Native system notifications
- 🎨 **Custom Styling** - Tailwind-inspired CSS with custom components

## Screenshots

The app features a clean sign-up interface with:
- Custom title bar with brand logo
- Centered "Poke" branding with animated logo
- Interactive "Start" button with hover effects
- Dark theme with proper contrast ratios

## Installation

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Setup

1. **Clone or download the project files**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm start
   ```

4. **For development with DevTools:**
   ```bash
   npm run dev
   ```

## Building for Distribution

### Build the application:
```bash
npm run build
```

### Create distributable packages:
```bash
npm run dist
```

This will create platform-specific installers in the `dist` folder.

## Project Structure

```
poke-electron-app/
├── main.js              # Main Electron process
├── renderer.js          # Renderer process (UI logic)
├── index.html           # Main HTML file
├── styles.css           # CSS styles
├── package.json         # Project configuration
└── README.md           # This file
```

## Features in Detail

### Window Controls
- **Minimize**: Reduces window to taskbar
- **Maximize**: Toggles between normal and maximized state
- **Close**: Exits the application

### Keyboard Shortcuts
- `Ctrl/Cmd + Q`: Quit application
- `F11`: Toggle fullscreen mode
- `Escape`: Exit fullscreen mode

### Animations
- Floating logo animation (3-second cycle)
- Button hover effects with scale transforms
- Smooth loading transitions
- Interactive feedback on button clicks

### Accessibility
- Proper focus management
- Keyboard navigation support
- High contrast color scheme
- Screen reader friendly markup

## Customization

### Colors
The app uses a dark theme with these primary colors:
- Background: `#2b2b2b`
- Content area: `#1b1c1d`
- Text: `#f4fffd`
- Accent: `rgba(244, 255, 253, 0.5)`

### Fonts
- **DynaPuff**: Used for brand text and titles
- **Inter**: Used for body text and buttons

### Styling
The CSS is organized with:
- Reset and base styles
- Component-specific styles
- Responsive design rules
- Animation keyframes
- Accessibility enhancements

## Development

### Adding Features
1. Modify `renderer.js` for UI interactions
2. Update `styles.css` for visual changes
3. Edit `index.html` for structural changes
4. Modify `main.js` for app-level functionality

### Debugging
- Use `npm run dev` to open DevTools automatically
- Check the console for logs and errors
- Use the built-in debugging tools

## Troubleshooting

### Common Issues

**App won't start:**
- Ensure Node.js is installed
- Run `npm install` to install dependencies
- Check for any error messages in the terminal

**Window controls not working:**
- Ensure you're running the latest version of Electron
- Check that `renderer.js` is properly loaded

**Styling issues:**
- Clear browser cache
- Ensure all CSS files are properly linked
- Check for any console errors

## License

MIT License - feel free to use this project as a starting point for your own applications.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

If you encounter any issues or have questions, please:
1. Check the troubleshooting section above
2. Look for similar issues in the repository
3. Create a new issue with detailed information

---

**Enjoy your Poke Electron app! 🚀** 