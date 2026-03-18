/**
 * ビルドスクリプト（esbuild 不要・手動でバンドル）
 * テスト用に React をグローバル参照する ESM ファイルを生成する
 */
const fs = require('fs');
const path = require('path');

const rendererCode = `
// ===== Hello Extension - Renderer Entry =====
// ArisChat が window.__ARISCHAT_REACT__ に React を公開してくれる
// ローダー側で React / useState / useEffect 等をグローバルに注入済み

// ===== Page 1: Hello Page =====
function HelloPage({ api }) {
  const [count, setCount] = useState(0);
  const [extInfo, setExtInfo] = useState(null);

  useEffect(() => {
    setExtInfo({
      id: api.extension.id,
      version: api.extension.version,
    });
  }, []);

  return React.createElement('div', {
    style: {
      padding: 24,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      fontFamily: 'sans-serif',
    }
  },
    React.createElement('h1', {
      style: { fontSize: 24, fontWeight: 'bold', margin: 0 }
    }, '\\uD83D\\uDC4B Hello Extension!'),
    React.createElement('p', {
      style: { color: '#888', margin: 0 }
    }, '拡張機能システムが正常に動作しています。'),
    extInfo && React.createElement('div', {
      style: {
        background: 'rgba(99, 179, 237, 0.1)',
        border: '1px solid rgba(99, 179, 237, 0.3)',
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
      }
    },
      React.createElement('div', null, '拡張ID: ', React.createElement('strong', null, extInfo.id)),
      React.createElement('div', null, 'バージョン: ', React.createElement('strong', null, extInfo.version)),
    ),
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }
    },
      React.createElement('button', {
        onClick: () => setCount(c => c - 1),
        style: {
          padding: '8px 16px',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 16,
          color: 'inherit',
        }
      }, '\\u2212'),
      React.createElement('span', {
        style: { fontSize: 24, fontWeight: 'bold', minWidth: 40, textAlign: 'center' }
      }, count),
      React.createElement('button', {
        onClick: () => setCount(c => c + 1),
        style: {
          padding: '8px 16px',
          background: 'rgba(99, 179, 237, 0.2)',
          border: '1px solid rgba(99, 179, 237, 0.4)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 16,
          color: 'inherit',
        }
      }, '+'),
    ),
    React.createElement('button', {
      onClick: () => api.navigation.goToChat(),
      style: {
        marginTop: 'auto',
        padding: '8px 16px',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        color: '#888',
      }
    }, '\\u2190 \\u30C1\\u30E3\\u30C3\\u30C8\\u306B\\u623B\\u308B'),
  );
}

// ===== Page 2: AI Chat Test =====
function AIChatPage({ api }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    let aiContent = '';
    try {
      const result = await api.ipc.invoke('ai-send', {
        messages: [{ id: String(Date.now()), role: 'user', content: userMsg, timestamp: Date.now() }],
      });
      aiContent = result && result.content ? result.content : '(\\u5FDC\\u7B54\\u306A\\u3057)';
    } catch (err) {
      aiContent = '\\u30A8\\u30E9\\u30FC: ' + (err.message || '\\u4E0D\\u660E\\u306A\\u30A8\\u30E9\\u30FC');
    }

    setMessages(prev => [...prev, { role: 'assistant', content: aiContent }]);
    setIsLoading(false);
  };

  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: 'sans-serif',
    }
  },
    React.createElement('div', {
      style: {
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        fontSize: 14,
        fontWeight: 'bold',
      }
    }, '\\uD83E\\uDD16 AI \\u30C6\\u30B9\\u30C8\\uFF08\\u62E1\\u5F35\\u6A5F\\u80FD\\u304B\\u3089\\u547C\\u3073\\u51FA\\u3057\\uFF09'),

    React.createElement('div', {
      style: {
        flex: 1,
        overflow: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }
    },
      ...messages.map((msg, i) =>
        React.createElement('div', {
          key: i,
          style: {
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
            padding: '8px 12px',
            borderRadius: 12,
            fontSize: 13,
            background: msg.role === 'user'
              ? 'rgba(99, 179, 237, 0.25)'
              : 'rgba(255,255,255,0.08)',
            border: '1px solid ' + (msg.role === 'user'
              ? 'rgba(99,179,237,0.4)'
              : 'rgba(255,255,255,0.1)'),
            whiteSpace: 'pre-wrap',
          }
        }, msg.content)
      ),
      isLoading && React.createElement('div', {
        style: { alignSelf: 'flex-start', color: '#888', fontSize: 13 }
      }, '\\u8003\\u3048\\u4E2D...'),
    ),

    React.createElement('div', {
      style: {
        padding: '8px 12px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        gap: 8,
      }
    },
      React.createElement('input', {
        value: input,
        onChange: e => setInput(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(); },
        placeholder: '\\u30E1\\u30C3\\u30BB\\u30FC\\u30B8\\u3092\\u5165\\u529B... (Enter \\u3067\\u9001\\u4FE1)',
        disabled: isLoading,
        style: {
          flex: 1,
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          fontSize: 13,
          color: 'inherit',
          outline: 'none',
        }
      }),
      React.createElement('button', {
        onClick: sendMessage,
        disabled: isLoading || !input.trim(),
        style: {
          padding: '8px 16px',
          background: 'rgba(99, 179, 237, 0.3)',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          color: 'inherit',
          opacity: (isLoading || !input.trim()) ? 0.5 : 1,
        }
      }, '\\u9001\\u4FE1'),
    ),
  );
}

// ===== Default Export =====
export default {
  pages: {
    'hello': HelloPage,
    'ai-chat': AIChatPage,
  },
};
`;

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'renderer.js'), rendererCode, 'utf-8');
console.log('✓ dist/renderer.js を生成しました');
