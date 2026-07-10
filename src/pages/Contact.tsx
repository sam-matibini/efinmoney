import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Clock, MessageSquare, Send, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const SUPPORT_EMAIL = "support@efin.money";

export default function Contact() {
  useEffect(() => { document.title = "Contact — eFinMoney"; }, []);

  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", company: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => {
      setSent(false);
      setForm({ name: "", email: "", subject: "", message: "", company: "" });
    }, 6000);
    return () => clearTimeout(t);
  }, [sent]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.message.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("contact-message", { body: form });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as any)?.context?.json())?.error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setSent(true);
    } catch (err) {
      toast.error((err as Error).message || "Could not send your message.");
    } finally {
      setSending(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-500))]/40 focus:border-[hsl(var(--brand-500))]";

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <MarketingHeader variant="solid" />

      {/* Hero */}
      <section className="relative bg-grid-purple text-white overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[hsl(var(--brand-500)/0.35)] blur-[140px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6 py-20 md:py-24 text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/90 mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" /> Contact us
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]"
          >
            We'd love to <span className="text-[hsl(var(--accent-amber))]">hear from you</span>.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mt-5 text-base md:text-lg text-white/70 max-w-2xl mx-auto"
          >
            Questions, partnerships or support — send us a message and our team will get back to you.
          </motion.p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* Body */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-[1fr_1.4fr] gap-10">
          {/* Info */}
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--brand-700))] flex items-center justify-center shrink-0"><Mail className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-[hsl(var(--brand-900))]">Email us</h3>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-[hsl(var(--brand-700))] hover:underline">{SUPPORT_EMAIL}</a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--brand-700))] flex items-center justify-center shrink-0"><Clock className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-[hsl(var(--brand-900))]">Response time</h3>
                <p className="text-sm text-neutral-600">We usually reply within one business day.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--brand-700))] flex items-center justify-center shrink-0"><MessageSquare className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-[hsl(var(--brand-900))]">In-app support</h3>
                <p className="text-sm text-neutral-600">Signed in? Message us from the envelope in your dashboard header for a tracked conversation.</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="rounded-3xl border border-neutral-200 shadow-sm p-6 md:p-8">
            {sent ? (
              <div className="text-center py-10">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center mb-4"><CheckCircle2 className="w-7 h-7" /></div>
                <h3 className="text-lg font-bold text-[hsl(var(--brand-900))]">Message sent!</h3>
                <p className="text-sm text-neutral-600 mt-1">Thanks for reaching out — we'll get back to you shortly.</p>
                <button
                  onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "", company: "" }); }}
                  className="mt-6 text-sm text-[hsl(var(--brand-700))] hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {/* honeypot */}
                <input type="text" name="company" value={form.company} onChange={set("company")} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Name</label>
                    <input value={form.name} onChange={set("name")} placeholder="Your name" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Email</label>
                    <input type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" className={inputCls} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Subject</label>
                  <input value={form.subject} onChange={set("subject")} placeholder="How can we help?" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Message</label>
                  <textarea value={form.message} onChange={set("message")} rows={5} placeholder="Tell us a bit more…" className={`${inputCls} resize-y`} />
                </div>
                <button
                  type="submit"
                  disabled={!valid || sending}
                  className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] font-bold px-6 py-3 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send message
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
