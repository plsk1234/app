"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

interface Subsidy {
  id: string;
  name: string;
  pref: string;
  detail: string;
  sourceType: "text" | "pdf" | "url";
  url?: string;
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

interface ChatSession {
  id: string;
  title: string;
  pref: string;
  industry: string;
  messages: ChatMessage[];
  createdAt: number;
}

const PREFS = [
  "東京都","神奈川県","千葉県","埼玉県","茨城県",
  "栃木県","群馬県","山梨県","長野県","新潟県",
];

const SUGGESTIONS = [
  "👋 こんにちは、自己紹介して",
  "☀️ 太陽光発電の導入を検討している",
  "🔋 蓄電池の導入を検討している",
  "❄️ エアコン・空調設備を更新したい",
  "💡 LED照明に切り替えたい",
];

const MAX_API_HISTORY = 10;

// ===== 個人情報検知 =====
const SENSITIVE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g, label: "メールアドレス" },
  { pattern: /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/g, label: "電話番号" },
  { pattern: /https?:\/\/[^\s]+/g, label: "URL" },
  { pattern: /〒?\d{3}[-\s]?\d{4}/g, label: "郵便番号" },
  { pattern: /(株式会社|有限会社|合同会社|一般社団法人|公益財団法人)/g, label: "法人名" },
];

function detectSensitiveInfo(text: string): string | null {
  for (const { pattern, label } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return label;
  }
  return null;
}
const MAX_SESSIONS = 30; // 保存する最大セッション数
const SESSIONS_KEY = "chatSessions";

type Screen = "login" | "app";
type ChatView = "chat" | "history";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("login");
  const [tab, setTab] = useState<"chat" | "manage" | "settings">("chat");
  const [chatView, setChatView] = useState<ChatView>("chat");

  // ログイン
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // チャット
  const [chatPref, setChatPref] = useState("");
  const [chatIndustry, setChatIndustry] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 履歴
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // 補助金管理
  const [subsidies, setSubsidies] = useState<Subsidy[]>([]);
  const [loadingSubsidies, setLoadingSubsidies] = useState(false);
  const [sourceTab, setSourceTab] = useState<"text" | "pdf" | "url">("text");
  const [subsidyName, setSubsidyName] = useState("");
  const [subsidyPref, setSubsidyPref] = useState("国");
  const [subsidyDetail, setSubsidyDetail] = useState("");
  const [subsidyUrl, setSubsidyUrl] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [urlStatus, setUrlStatus] = useState("");
  const [filterPref, setFilterPref] = useState("");
  const [adding, setAdding] = useState(false);

  // 管理者認証
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState("");
  const [adminPwError, setAdminPwError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  // ===== 初期化 =====
  useEffect(() => {
    if (sessionStorage.getItem("loggedIn") === "true") {
      setScreen("app");
      loadSessions();
    }
  }, []);

  useEffect(() => {
    if (tab === "manage") fetchSubsidies();
    if (tab !== "settings") {
      setAdminUnlocked(false);
      setAdminPwInput("");
      setAdminPwError("");
    }
  }, [tab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ===== セッション管理 =====
  function loadSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      const data: ChatSession[] = raw ? JSON.parse(raw) : [];
      setSessions(data.sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      setSessions([]);
    }
  }

  function saveSession(msgs: ChatMessage[], sessionId: string | null, pref: string, industry: string) {
    if (msgs.length === 0) return;
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      const data: ChatSession[] = raw ? JSON.parse(raw) : [];

      const title = msgs[0].text.slice(0, 30) + (msgs[0].text.length > 30 ? "..." : "");

      if (sessionId) {
        const idx = data.findIndex(s => s.id === sessionId);
        if (idx !== -1) {
          data[idx] = { ...data[idx], messages: msgs };
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(data));
          setSessions(data.sort((a, b) => b.createdAt - a.createdAt));
          return;
        }
      }

      const newSession: ChatSession = {
        id: Date.now().toString(),
        title,
        pref,
        industry,
        messages: msgs,
        createdAt: Date.now(),
      };

      const updated = [newSession, ...data].slice(0, MAX_SESSIONS);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
      setSessions(updated);
      setCurrentSessionId(newSession.id);
    } catch {
      // localStorage満杯の場合は古いものを削除
      try {
        localStorage.removeItem(SESSIONS_KEY);
      } catch {}
    }
  }

  function deleteSession(id: string) {
    const updated = sessions.filter(s => s.id !== id);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    setSessions(updated);
  }

  function loadSession(session: ChatSession) {
    setMessages(session.messages);
    setChatPref(session.pref);
    setChatIndustry(session.industry);
    setCurrentSessionId(session.id);
    setChatView("chat");
  }

  function copySession(session: ChatSession) {
    const text = session.messages
      .map(m => `${m.role === "user" ? "【質問】" : "【回答】"}\n${m.text}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(session.id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function copyCurrentChat() {
    const text = messages
      .map(m => `${m.role === "user" ? "【質問】" : "【回答】"}\n${m.text}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied("current");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // ===== ログイン =====
  async function doLogin() {
    if (!loginPw.trim()) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPw, type: "app" }),
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem("loggedIn", "true");
        setScreen("app");
        setLoginPw("");
        loadSessions();
      } else {
        setLoginError(data.error || "パスワードが違います");
      }
    } catch {
      setLoginError("通信エラーが発生しました");
    } finally {
      setLoginLoading(false);
    }
  }

  function doLogout() {
    sessionStorage.removeItem("loggedIn");
    setScreen("login");
    setMessages([]);
    setLoginPw("");
    setLoginError("");
  }

  // ===== 管理者認証 =====
  async function doAdminAuth() {
    if (!adminPwInput.trim()) return;
    setAdminLoading(true);
    setAdminPwError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPwInput, type: "admin" }),
      });
      const data = await res.json();
      if (res.ok) {
        setAdminUnlocked(true);
        setAdminPwInput("");
      } else {
        setAdminPwError(data.error || "パスワードが違います");
      }
    } catch {
      setAdminPwError("通信エラーが発生しました");
    } finally {
      setAdminLoading(false);
    }
  }

  // ===== 補助金API =====
  async function fetchSubsidies() {
    setLoadingSubsidies(true);
    try {
      const res = await fetch("/api/subsidies");
      const data = await res.json();
      setSubsidies(Array.isArray(data) ? data : []);
    } catch {
      setSubsidies([]);
    } finally {
      setLoadingSubsidies(false);
    }
  }

  async function addSubsidy() {
    if (!subsidyName.trim()) { alert("補助金名を入力してください"); return; }
    let detail = "";
    const sourceType = sourceTab;

    if (sourceType === "text") {
      detail = subsidyDetail.trim();
      if (!detail) { alert("詳細情報を入力してください"); return; }
    } else if (sourceType === "pdf") {
      if (!pdfText) { alert("PDFを先に読み込んでください"); return; }
      detail = pdfText;
    } else {
      if (!subsidyUrl.trim()) { alert("URLを入力してください"); return; }
      setUrlStatus("🔗 URLを取得中...");
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: subsidyUrl }),
      });
      const data = await res.json();
      if (data.error) { setUrlStatus("❌ " + data.error); return; }
      detail = data.text;
      setUrlStatus(`✅ ${detail.length}文字を取得しました`);
    }

    setAdding(true);
    try {
      const res = await fetch("/api/subsidies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: subsidyName, pref: subsidyPref, detail, sourceType, url: sourceType === "url" ? subsidyUrl : "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSubsidyName(""); setSubsidyDetail(""); setSubsidyUrl("");
      setPdfText(""); setPdfStatus(""); setUrlStatus("");
      await fetchSubsidies();
      alert("登録しました！");
    } catch (e) {
      alert("登録失敗: " + e);
    } finally {
      setAdding(false);
    }
  }

  async function deleteSubsidy(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch(`/api/subsidies/${id}`, { method: "DELETE" });
    await fetchSubsidies();
  }

  // ===== PDF処理 =====
  async function processPdf(file: File) {
    setPdfStatus("📄 PDFを読み込み中...");
    try {
      // @ts-expect-error pdfjsLib is loaded via CDN
      const pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        setPdfStatus(`📄 ${i} / ${pdf.numPages} ページ処理中...`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: { str: string }) => item.str).join(" ") + "\n";
      }
      setPdfText(text.trim().slice(0, 8000));
      setPdfStatus(`✅ ${pdf.numPages}ページ分を抽出しました`);
    } catch (e) {
      setPdfStatus("❌ PDF読み込みに失敗しました: " + e);
    }
  }

  // ===== チャット =====
  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? inputText).trim();
    if (!text) return;
    // 個人情報チェック（フロント）
    const detected = detectSensitiveInfo(text);
    if (detected) {
      alert(`個人情報・機密情報は入力しないでください\n（検知：${detected}）`);
      return;
    }

    if (!chatPref) { alert("都道府県を選択してください"); return; }

    const newMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(newMessages);
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);

    const apiMessages = newMessages.slice(-MAX_API_HISTORY);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, pref: chatPref, industry: chatIndustry }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const finalMessages = [...newMessages, { role: "model" as const, text: data.answer }];
      setMessages(finalMessages);
      saveSession(finalMessages, currentSessionId, chatPref, chatIndustry);
    } catch (e) {
      setMessages([...newMessages, { role: "model", text: "❌ エラー: " + e }]);
    } finally {
      setSending(false);
    }
  }

  function newChat() {
    setMessages([]);
    setCurrentSessionId(null);
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function formatDate(ts: number) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const filteredSubsidies = filterPref
    ? subsidies.filter((s) => s.pref === filterPref)
    : subsidies;

  // ===== ログイン画面 =====
  if (screen === "login") {
    return (
      <div className={styles.loginScreen}>
        <div className={styles.loginCard}>
          <h1 className={styles.loginLogo}>// 補助金マッチャー</h1>
          <p className={styles.loginSubtitle}>社内専用ツール<br />パスワードを入力してください</p>
          <input
            type="password"
            value={loginPw}
            onChange={(e) => setLoginPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }}
            placeholder="パスワード"
            className={styles.loginInput}
          />
          {loginError && <p className={styles.loginError}>{loginError}</p>}
          <button className={styles.btnPrimary} onClick={doLogin} disabled={loginLoading}>
            {loginLoading ? "確認中..." : "ログイン"}
          </button>
        </div>
      </div>
    );
  }

  // ===== メイン画面 =====
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.logo}>// 補助金マッチャー</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={styles.geminiBadge}>✦ Gemini 3.1 Flash Lite</span>
          <button className={styles.btnLogout} onClick={doLogout}>ログアウト</button>
        </div>
      </header>

      <nav className={styles.tabs}>
        {(["chat", "manage", "settings"] as const).map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "chat" ? "💬 チャット" : t === "manage" ? "📋 補助金管理" : "⚙️ 設定（管理者）"}
          </button>
        ))}
      </nav>

      {/* チャットパネル */}
      {tab === "chat" && (
        <div className={styles.panel}>
          <div className={styles.chatSetup}>
            <span className={styles.setupLabel}>都道府県：</span>
            <select value={chatPref} onChange={(e) => setChatPref(e.target.value)} className={styles.select}>
              <option value="">選択してください</option>
              {PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className={styles.setupLabel}>業種（任意）：</span>
            <input
              type="text"
              value={chatIndustry}
              onChange={(e) => setChatIndustry(e.target.value)}
              placeholder="例：製造業"
              className={styles.industryInput}
            />
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button
                className={styles.btnNewChat}
                onClick={() => { setChatView(chatView === "chat" ? "history" : "chat"); }}
              >
                {chatView === "chat" ? "📋 履歴" : "💬 チャット"}
              </button>
              {chatView === "chat" && (
                <>
                  {messages.length > 0 && (
                    <button className={styles.btnNewChat} onClick={copyCurrentChat}>
                      {copied === "current" ? "✅ コピー済み" : "📋 コピー"}
                    </button>
                  )}
                  <button className={styles.btnNewChat} onClick={newChat}>🔄 新しい相談</button>
                </>
              )}
            </div>
          </div>

          {/* チャット表示 */}
          {chatView === "chat" ? (
            <>
              <div className={styles.chatMessages}>
                {messages.length === 0 && !sending ? (
                  <div className={styles.chatEmpty}>
                    <div className={styles.emptyIcon}>✦</div>
                    <h3>補助金についてご相談ください</h3>
                    <p>都道府県を選択して、案件の内容を入力してください。<br />追加の質問も続けてできます。</p>
                    <p style={{fontSize: "0.76rem", color: "var(--accent2)", marginTop: 4, lineHeight: 1.7}}>
                      💡 業種・金額・目的など具体的に書くと回答が速くなります
                    </p>
                    <div className={styles.chips}>
                      {SUGGESTIONS.map((s) => (
                        <button key={s} className={styles.chip} onClick={() => sendMessage(s)}>{s}</button>
                      ))}
                    </div>
                    {sessions.length > 0 && (
                      <button
                        className={styles.chip}
                        style={{ marginTop: 8, borderColor: "var(--accent2)", color: "var(--accent2)" }}
                        onClick={() => setChatView("history")}
                      >
                        📋 過去の相談を見る（{sessions.length}件）
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((m, i) => (
                      <div key={i} className={`${styles.msg} ${m.role === "user" ? styles.msgUser : styles.msgAi}`}>
                        <div className={styles.avatar}>{m.role === "user" ? "👤" : "✦"}</div>
                        <div className={styles.bubble}>{m.text}</div>
                      </div>
                    ))}
                    {sending && (
                      <div className={`${styles.msg} ${styles.msgAi}`}>
                        <div className={styles.avatar}>✦</div>
                        <div className={styles.bubble} style={{display: "flex", flexDirection: "column", gap: 6}}>
                          <div style={{display: "flex", gap: 4}}>
                            <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                          </div>
                          <span style={{fontSize: "0.75rem", color: "var(--text-muted)"}}>少々お待ちください...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <div className={styles.chatInputArea}>
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => { setInputText(e.target.value); autoResize(e.target); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="案件内容や質問を入力..."
                  rows={1}
                  className={styles.chatInput}
                />
                <button className={styles.btnSend} onClick={() => sendMessage()} disabled={sending}>➤</button>
              </div>
            </>
          ) : (
            /* 履歴表示 */
            <div className={styles.historyPanel}>
              {sessions.length === 0 ? (
                <div className={styles.chatEmpty}>
                  <div className={styles.emptyIcon}>📋</div>
                  <h3>過去の相談はありません</h3>
                  <p>チャットで相談すると自動的に保存されます。</p>
                </div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className={styles.sessionItem}>
                    <div className={styles.sessionHeader}>
                      <div className={styles.sessionMeta}>
                        <span className={styles.sessionDate}>{formatDate(s.createdAt)}</span>
                        <span className={styles.sessionPref}>{s.pref}{s.industry ? ` / ${s.industry}` : ""}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className={styles.btnSessionAction} onClick={() => copySession(s)}>
                          {copied === s.id ? "✅" : "📋"}
                        </button>
                        <button className={styles.btnSessionDanger} onClick={() => deleteSession(s.id)}>🗑️</button>
                      </div>
                    </div>
                    <p className={styles.sessionTitle}>{s.title}</p>
                    <p className={styles.sessionCount}>{s.messages.length}件のメッセージ</p>
                    <button className={styles.btnSessionLoad} onClick={() => loadSession(s)}>
                      この会話を再開する →
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 補助金管理パネル */}
      {tab === "manage" && (
        <div className={`${styles.panel} ${styles.panelScroll}`}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>補助金ソースを追加</h3>
            <div className={styles.sourceTypeTabs}>
              {(["text", "pdf", "url"] as const).map((t) => (
                <button key={t} className={`${styles.sourceTab} ${sourceTab === t ? styles.sourceTabActive : ""}`} onClick={() => setSourceTab(t)}>
                  {t === "text" ? "📝 テキスト" : t === "pdf" ? "📄 PDF" : "🔗 URL"}
                </button>
              ))}
            </div>
            <label className={styles.label}>補助金名</label>
            <input type="text" value={subsidyName} onChange={(e) => setSubsidyName(e.target.value)} placeholder="例：ものづくり補助金" className={styles.formInput} />
            <label className={styles.label}>対象地域</label>
            <select value={subsidyPref} onChange={(e) => setSubsidyPref(e.target.value)} className={styles.formSelect}>
              <option value="国">🏛️ 国（全都道府県で常に参照）</option>
              {PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {sourceTab === "text" && (
              <>
                <label className={styles.label}>詳細情報</label>
                <textarea value={subsidyDetail} onChange={(e) => setSubsidyDetail(e.target.value)} placeholder="例：中小製造業者向け。設備投資の最大2/3補助、上限1000万円。省エネ・DX対象。従業員20名以下。" className={styles.formTextarea} />
              </>
            )}
            {sourceTab === "pdf" && (
              <>
                <div className={styles.notice}>📌 PDFからテキストを自動抽出して登録します。スキャン画像PDFは抽出できない場合があります。</div>
                <div className={styles.dropZone} onClick={() => document.getElementById("pdfInput")?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processPdf(f); }}>
                  <div className={styles.dropIcon}>📄</div>
                  <p>{pdfText ? "✅ PDFを読み込み済み" : "クリックまたはPDFをドラッグ＆ドロップ"}</p>
                  <input id="pdfInput" type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) processPdf(e.target.files[0]); }} />
                </div>
                {pdfStatus && <p className={styles.progressText}>{pdfStatus}</p>}
              </>
            )}
            {sourceTab === "url" && (
              <>
                <div className={styles.notice}>📌 URLのページ内容を取得して登録します。サイトによっては取得できない場合があります。</div>
                <label className={styles.label}>補助金情報のURL</label>
                <input type="url" value={subsidyUrl} onChange={(e) => setSubsidyUrl(e.target.value)} placeholder="https://..." className={styles.formInput} />
                {urlStatus && <p className={styles.progressText}>{urlStatus}</p>}
              </>
            )}
            <button className={styles.btnPrimary} onClick={addSubsidy} disabled={adding}>{adding ? "登録中..." : "＋ 追加する"}</button>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>登録済み補助金</h3>
            <div className={styles.filterBar}>
              <select value={filterPref} onChange={(e) => setFilterPref(e.target.value)} className={styles.formSelect} style={{ marginBottom: 0, flex: 1 }}>
                <option value="">すべての地域</option>
                <option value="国">🏛️ 国</option>
                {PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <span className={styles.filterCount}>{filteredSubsidies.length} 件</span>
            </div>
            {loadingSubsidies ? (
              <p className={styles.emptyState}>読み込み中...</p>
            ) : subsidies.length === 0 ? (
              <p className={styles.emptyState}>まだ補助金が登録されていません</p>
            ) : filteredSubsidies.length === 0 ? (
              <p className={styles.emptyState}>該当する補助金がありません</p>
            ) : (
              filteredSubsidies.map((s) => (
                <div key={s.id} className={styles.subsidyItem}>
                  <div className={styles.subsidyHeader}>
                    <div style={{ flex: 1 }}>
                      <span className={`${styles.badge} ${s.sourceType === "pdf" ? styles.badgePdf : s.sourceType === "url" ? styles.badgeUrl : styles.badgeText}`}>
                        {s.sourceType === "pdf" ? "📄 PDF" : s.sourceType === "url" ? "🔗 URL" : "📝 テキスト"}
                      </span>
                      <span className={`${styles.badge} ${s.pref === "国" ? styles.badgeNational : styles.badgePref}`}>{s.pref}</span>
                      <h4 className={styles.subsidyName}>{s.name}</h4>
                      <p className={styles.subsidyPreview}>{s.detail.slice(0, 80)}{s.detail.length > 80 ? "..." : ""}</p>
                      {s.url && <p className={styles.subsidyUrl}>🔗 {s.url}</p>}
                    </div>
                    <button className={styles.btnDanger} onClick={() => deleteSubsidy(s.id)}>削除</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 設定パネル */}
      {tab === "settings" && (
        <div className={`${styles.panel} ${styles.panelScroll}`}>
          {!adminUnlocked ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>管理者認証</h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                設定画面は管理者専用です。管理者パスワードを入力してください。
              </p>
              <label className={styles.label}>管理者パスワード</label>
              <input
                type="password"
                value={adminPwInput}
                onChange={(e) => setAdminPwInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doAdminAuth(); }}
                placeholder="管理者パスワード"
                className={styles.formInput}
              />
              {adminPwError && <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginBottom: 10 }}>{adminPwError}</p>}
              <button className={styles.btnPrimary} onClick={doAdminAuth} disabled={adminLoading}>
                {adminLoading ? "確認中..." : "認証する"}
              </button>
            </div>
          ) : (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>システム情報</h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.8 }}>
                APIキーはVercelの環境変数で管理されています。<br />
                変更する場合はVercelダッシュボード → Settings → Environment Variables から更新してください。<br /><br />
                <strong style={{ color: "var(--text)" }}>管理する環境変数：</strong><br />
                GEMINI_API_KEY — Gemini APIキー<br />
                APP_PASSWORD — 社員ログインパスワード<br />
                ADMIN_PASSWORD — 管理者パスワード<br />
                REDIS_URL — Redis接続URL
              </p>
              <button
                style={{ marginTop: 16, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: "0.82rem", width: "100%" }}
                onClick={() => setAdminUnlocked(false)}
              >
                🔒 ロックする
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
