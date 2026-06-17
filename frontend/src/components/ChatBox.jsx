import { useEffect, useRef, useState } from 'react';

const MAX_LEN = 100;
const VISIBLE_COUNT = 8;

/**
 * 多人游戏聊天框。
 *
 * - 按 Enter 呼出输入框（同时释放指针锁定，让用户能打字）。
 * - 输入框内按 Enter 发送、Esc 取消。
 * - 历史消息在右下角、速度档位旁边以半透明玻璃面板滚动显示。
 * - 文本最长 100 字（前端截断，服务端二次兜底）。
 *
 * 聊天内容的脏话屏蔽在服务端完成，这里只负责收发与展示。
 */
export default function ChatBox({ messages, onSend }) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // 新消息到达时自动滚到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, composing]);

  const openComposer = () => {
    if (composing) return;
    setComposing(true);
    setDraft('');
    // 释放指针锁定，否则输入框无法获得焦点、也无法接受键盘输入
    if (document.pointerLockElement) document.exitPointerLock();
    // 等下一帧再聚焦，确保输入框已挂载
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closeComposer = () => {
    setComposing(false);
    setDraft('');
  };

  // 全局按键：Enter 呼出；输入框内 Enter 发送、Esc 取消。
  // 注意：输入框聚焦时不要让“游戏内”的按键处理（controls.js）拦截方向键等。
  useEffect(() => {
    const onKeyDown = (e) => {
      if (composing) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const text = draft.trim();
          if (text && onSend) onSend(text);
          closeComposer();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeComposer();
        }
        // 阻止事件冒泡到游戏的 keydown 监听，避免打字时触发档位/技能
        e.stopPropagation();
        return;
      }
      if (e.key === 'Enter') {
        // 只在不在输入态时呼出；避免和浏览器原生输入冲突
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        openComposer();
      }
    };
    // 用捕获阶段拦截，确保优先于 controls.js 的 document 监听
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composing, draft, onSend]);

  const recent = messages.length > VISIBLE_COUNT
    ? messages.slice(messages.length - VISIBLE_COUNT)
    : messages;

  return (
    <div id="mp-chat">
      {!composing && recent.length > 0 && (
        <div className="mp-chat-history" ref={listRef}>
          {recent.map((m, i) => (
            m.sys ? (
              <div className="mp-chat-line mp-chat-sys" key={m.ts + '-' + i}>
                <span className="mp-chat-text">{m.msg}</span>
              </div>
            ) : (
              <div className="mp-chat-line" key={m.ts + '-' + i}>
                <span className="mp-chat-name">{m.from}:</span>
                <span className="mp-chat-text">{m.msg}</span>
              </div>
            )
          ))}
        </div>
      )}

      {composing ? (
        <div className="mp-chat-composer">
          <input
            ref={inputRef}
            className="mp-chat-input"
            type="text"
            maxLength={MAX_LEN}
            value={draft}
            placeholder="输入消息，回车发送（Esc 取消）…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <span className="mp-chat-count">{draft.length}/{MAX_LEN}</span>
        </div>
      ) : (
        <div className="mp-chat-hint">
          按 <kbd>Enter</kbd> 发送消息
        </div>
      )}
    </div>
  );
}
