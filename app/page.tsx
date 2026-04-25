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

const PREFS = [
  "東京都","神奈川県","千葉県","埼玉県","茨城県",
  "栃木県","群馬県","山梨県","長野県","新潟県",
];

const SUGGESTIONS = [
  "省エネ設備を導入したい",
  "DX化を進めたい",
  "設備投資の補助金を探したい",
  "雇用を増やす予定がある",
];

const MAX_API_HISTORY = 10;

type Screen = "login" | "app";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("login");
  const [tab, setTab] = useState<"chat" | "manage" | "settings">("chat");

  // ログイン
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // チャット
  const [chatPref, setChatPref] = useState("");
  const [chatIndustry, setChatIndustry] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // ===== 初期化：sessionStorageでログイン状態を保持 =====
  useEffect(() => {
    if (sessionStorage.getItem("loggedIn") === "true") {
      setScreen("app");
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
      setMessages([...newMessages, { role: "model", text: data.answer }]);
    } catch (e) {
      setMessages([...newMessages, { role: "model", text: "❌ エラー: " + e }]);
    } finally {
      setSending(false);
    }
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
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
          <button
            className={styles.btnPrimary}
            onClick={doLogin}
            disabled={loginLoading}
          >
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
          <span className={styles.geminiBadge}>✦ Gemini 2.5 Flash</span>
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
            <button className={styles.btnNewChat} onClick={() => setMessages([])}>🔄 新しい相談</button>
          </div>

          <div className={styles.chatMessages}>
            {messages.length === 0 && !sending ? (
              <div className={styles.chatEmpty}>
                <div className={styles.emptyIcon}>✦</div>
                <h3>補助金についてご相談ください</h3>
                <p>都道府県を選択して、案件の内容を入力してください。<br />追加の質問も続けてできます。</p>
                <div className={styles.chips}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className={styles.chip} onClick={() => sendMessage(s)}>{s}</button>
                  ))}
                </div>
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
                    <div className={styles.bubble}>
                      <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
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

      {/* 設定パネル（管理者専用） */}
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
