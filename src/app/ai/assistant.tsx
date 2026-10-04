"use client";

import { useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

const prompts = [
  "What should I focus on today?",
  "How can I improve room occupancy?",
  "Summarise my sales and expenses.",
];

export function OperationsAssistant({ hotelName, currency, dailyLimit }: { hotelName: string; currency: string; dailyLimit: number }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setQuestion("");
    setMessages((items) => [...items, { role: "user", content: text }]);
    try {
      const response = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const result = await response.json() as { answer?: string; error?: string };
      if (!response.ok || !result.answer) throw new Error(result.error || "The assistant couldn’t answer. Try again.");
      setMessages((items) => [...items, { role: "assistant", content: result.answer! }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assistant couldn’t answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="module-card ai-assistant-card">
    <div className="module-card-heading"><h2>Ask Innova AI</h2><p>Get practical guidance using {hotelName}&apos;s recent, aggregated operating figures ({currency}).</p></div>
    {!messages.length && <div className="ai-prompt-list">{prompts.map((prompt) => <button type="button" className="ai-prompt" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<span>→</span></button>)}</div>}
    {!!messages.length && <div className="ai-message-list" aria-live="polite">{messages.map((message, index) => <article className={`ai-message ai-${message.role}`} key={`${index}-${message.role}`}><strong>{message.role === "user" ? "You" : "Innova AI"}</strong><p>{message.content}</p></article>)}{busy && <p className="ai-thinking" role="status">Innova AI is reviewing the recent figures…</p>}</div>}
    {error && <p className="form-message error-message" role="alert">{error}</p>}
    <form className="ai-question-form" onSubmit={ask}><label className="visually-hidden" htmlFor="aiQuestion">Ask a question about your property</label><textarea id="aiQuestion" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={800} rows={3} placeholder="Ask about occupancy, sales, or what to prioritise…" required /><div><small>Do not include guest names, passwords, or payment card details.</small><button className="primary-button" disabled={busy || !question.trim()} type="submit">{busy ? "Thinking…" : "Ask Innova AI →"}</button></div></form>
    <p className="ai-usage-note">Up to {dailyLimit} questions per owner, admin, or manager each day. Suggestions are guidance, not accounting or legal advice.</p>
  </section>;
}
