'use strict';

// Konsol renk paletleri (xterm teması). Her bağlantı birini seçebilir; anahtar bağlantıda "theme" olarak saklanır.

const TERMINAL_THEMES = {
  sshmaster: {
    name: 'SSH Master',
    background: '#0b0f17', foreground: '#d6deeb', cursor: '#22d3ee', cursorAccent: '#0b0f17', selectionBackground: 'rgba(99,102,241,0.45)',
    black: '#1e2738', red: '#f87171', green: '#34d399', yellow: '#fbbf24', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#d6deeb',
    brightBlack: '#5b6b85', brightRed: '#fca5a5', brightGreen: '#6ee7b7', brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#ffffff',
  },
  campbell: {
    name: 'Campbell (Windows)',
    background: '#0c0c0c', foreground: '#cccccc', cursor: '#ffffff', cursorAccent: '#0c0c0c', selectionBackground: 'rgba(255,255,255,0.25)',
    black: '#0c0c0c', red: '#c50f1f', green: '#13a10e', yellow: '#c19c00', blue: '#0037da', magenta: '#881798', cyan: '#3a96dd', white: '#cccccc',
    brightBlack: '#767676', brightRed: '#e74856', brightGreen: '#16c60c', brightYellow: '#f9f1a5', brightBlue: '#3b78ff', brightMagenta: '#b4009e', brightCyan: '#61d6d6', brightWhite: '#f2f2f2',
  },
  ubuntu: {
    name: 'Ubuntu',
    background: '#300a24', foreground: '#eeeeec', cursor: '#eeeeec', cursorAccent: '#300a24', selectionBackground: 'rgba(238,238,236,0.25)',
    black: '#2e3436', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000', blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
    brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234', brightYellow: '#fce94f', brightBlue: '#729fcf', brightMagenta: '#ad7fa8', brightCyan: '#34e2e2', brightWhite: '#eeeeec',
  },
  dracula: {
    name: 'Dracula',
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36', selectionBackground: 'rgba(68,71,90,0.9)',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  onedark: {
    name: 'One Dark',
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', cursorAccent: '#282c34', selectionBackground: 'rgba(62,68,81,0.9)',
    black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
  },
  monokai: {
    name: 'Monokai',
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', cursorAccent: '#272822', selectionBackground: 'rgba(73,72,62,0.9)',
    black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75', blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
  },
  nord: {
    name: 'Nord',
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440', selectionBackground: 'rgba(67,76,94,0.9)',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  gruvbox: {
    name: 'Gruvbox Dark',
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828', selectionBackground: 'rgba(80,73,69,0.9)',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921', blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
  },
  tokyonight: {
    name: 'Tokyo Night',
    background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', cursorAccent: '#1a1b26', selectionBackground: 'rgba(40,52,87,0.9)',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
  },
  solarizedDark: {
    name: 'Solarized Dark',
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1', cursorAccent: '#002b36', selectionBackground: 'rgba(7,54,66,0.9)',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  matrix: {
    name: t('theme.matrix'),
    background: '#000000', foreground: '#33ff66', cursor: '#33ff66', cursorAccent: '#000000', selectionBackground: 'rgba(51,255,102,0.25)',
    black: '#000000', red: '#1f9e3f', green: '#33ff66', yellow: '#7dff9b', blue: '#1fbf55', magenta: '#2bd965', cyan: '#5dff88', white: '#b3ffc6',
    brightBlack: '#0f5c24', brightRed: '#33cc5a', brightGreen: '#66ff8c', brightYellow: '#99ffb3', brightBlue: '#33e070', brightMagenta: '#4dff7f', brightCyan: '#80ffa6', brightWhite: '#e6ffec',
  },
  solarizedLight: {
    name: 'Solarized Light',
    background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', cursorAccent: '#fdf6e3', selectionBackground: 'rgba(147,161,161,0.35)',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  githubLight: {
    name: 'GitHub Light',
    background: '#ffffff', foreground: '#24292f', cursor: '#0969da', cursorAccent: '#ffffff', selectionBackground: 'rgba(84,174,255,0.3)',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
  },
};

const DEFAULT_THEME = 'sshmaster';
const getTheme = (key) => TERMINAL_THEMES[key] || TERMINAL_THEMES[DEFAULT_THEME];

// Küçük terminal önizlemesi (palet seçicide kullanılır)
function themePreviewHtml(key) {
  const th = getTheme(key);
  const sw = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((c) => `<i style="background:${th[c]}"></i>`).join('');
  return `<div class="tp-screen" style="background:${th.background};color:${th.foreground}">
      <div><span style="color:${th.green}">user@host</span>:<span style="color:${th.blue}">~</span>$ ls</div>
      <div><span style="color:${th.blue}">docs</span> <span style="color:${th.green}">run.sh</span> <span style="color:${th.red}">err.log</span></div>
      <div class="tp-sw">${sw}</div>
    </div>
    <div class="tp-name">${esc(t.name)}</div>`;
}

// Palet ızgarası; seçilince onPick(key) çağrılır
function themeGrid(selected, onPick) {
  const grid = h('<div class="theme-grid"></div>');
  for (const key of Object.keys(TERMINAL_THEMES)) {
    const b = h(`<button type="button" class="theme-card ${key === selected ? 'on' : ''}" data-key="${key}">${themePreviewHtml(key)}</button>`);
    b.onclick = () => {
      grid.querySelectorAll('.theme-card').forEach((x) => x.classList.toggle('on', x === b));
      onPick(key);
    };
    grid.appendChild(b);
  }
  return grid;
}
