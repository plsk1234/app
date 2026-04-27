"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

const PREFS = [
  "東京都","神奈川県","千葉県","埼玉県","茨城県",
  "栃木県","群馬県","山梨県","長野県","新潟県",
];

const SUGGESTIONS = [
  "👋 こんにちは",
  "💡 LEDに切り替えたい",
  "☀️ 太陽光を導入したい",
  "🔋 蓄電池を検討している",
];

const MAX_API_HISTORY = 10;

export default function Home() {
  const [chatPref, setChatPref] = useState("");
  const [chatIndustry, setChatIndustry] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ===== メッセージ送信 =====
  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? inputText).trim();
    if (!text) return;

    if (!chatPref) {
      alert("都道府県を選択してください");
      return;
    }

    const newMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(newMessages);
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setSending(true);

    try {
      const apiMessages = newMessages.slice(-MAX_API_HISTORY);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          pref: chatPref,
          industry: chatIndustry,
        }),
      });

      const data = await res.json();

      const answer =
        res.ok && data.answer
          ? data.answer
          : "現在応答できません。しばらくしてからお試しください。";

      setMessages([
        ...newMessages,
        { role: "model", text: answer },
      ]);

    } catch (e) {
      setMessages([
        ...newMessages,
        {
          role: "model",
          text: "現在応答できません。しばらくしてからお試しください。",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function newChat() {
    setMessages([]);
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.logo}>// 補助金マッチャー</h1>
        <span className={styles.geminiBadge}>
          ✦ Gemini 3.1 Flash Lite + Fallback
        </span>
      </header>

      {/* 設定 */}
      <div className={styles.setup}>
        <select
          value={chatPref}
          onChange={(e) => setChatPref(e.target.value)}
          className={styles.select}
        >
          <option value="">都道府県を選択</option>
          {PREFS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <input
          type="text"
          value={chatIndustry}
          onChange={(e) => setChatIndustry(e.target.value)}
          placeholder="業種（任意）"
          className={styles.input}
        />

        <button className={styles.btn} onClick={newChat}>
          🔄 新しい相談
        </button>
      </div>

      {/* チャット */}
      <div className={styles.chat}>
        {messages.length === 0 && !sending ? (
          <div className={styles.empty}>
            <h3>補助金についてご相談ください</h3>
            <div className={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className={styles.chip}
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={styles.message}>
                <div className={styles.avatar}>
                  {m.role === "user" ? "👤" : "✦"}
                </div>
                <div className={styles.bubble}>{m.text}</div>
              </div>
            ))}

            {sending && (
              <div className={styles.message}>
                <div className={styles.avatar}>✦</div>
                <div className={styles.bubble}>
                  <span>少々お待ちください...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 入力 */}
      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            autoResize(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="案件内容を入力..."
          className={styles.textarea}
        />
        <button
          className={styles.send}
          onClick={() => sendMessage()}
          disabled={sending}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
