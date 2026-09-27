"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./Icon";
import s from "./InputRulesHelp.module.css";

function Example({ text, spellings }: { text: string; spellings: string[] }) {
  return (
    <div className={s.example}>
      <span lang="ja">{text}</span>
      <span aria-hidden="true" className={s.arrow}>
        →
      </span>
      <span className={s.spellings}>
        {spellings.map((spelling, index) => (
          <span key={spelling}>
            {index > 0 && <span className={s.or}> / </span>}
            <kbd>{spelling}</kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

export function InputRulesHelp({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations("InputRules");
  const rich = (key: "particlesText" | "smallKanaText" | "nText" | "minnaText" | "completionText" | "hyphenText" | "combinationsText" | "longVowelText" | "timerText") => t.rich(key, {
    kbd: (chunks) => <kbd>{chunks}</kbd>,
    kana: (chunks) => <span lang="ja">{chunks}</span>,
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  function open() {
    if (!dialog.current || dialog.current.open) return;
    onOpen?.();
    dialog.current.showModal();
    if (content.current) content.current.scrollTop = 0;
    closeButton.current?.focus();
    setIsOpen(true);
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={open}
        className={s.trigger}
        aria-haspopup="dialog"
      >
        <Icon name="keyboard" size={16} />
        {t("title")}
      </button>
      <dialog
        ref={dialog}
        className={s.dialog}
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (
            event.key !== "Tab" ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return;
          // Native modal focus may otherwise leave the document for browser chrome.
          const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], [tabindex="0"]',
          );
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => {
          setIsOpen(false);
          trigger.current?.focus();
        }}
      >
        <div className={s.header}>
          <div>
            <div className="eyebrow">{t("eyebrow")}</div>
            <h2 id={titleId}>{t("title")}</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className={s.closeButton}
            aria-label={t("closeLabel")}
            onClick={() => dialog.current?.close()}
          >
            {t("close")} <span aria-hidden="true">×</span>
          </button>
        </div>
        <div
          ref={content}
          className={s.content}
          aria-label={t("contentLabel")}
          tabIndex={0}
        >
          <p className={s.intro}>
            {t("intro")}
            <br />
            {t("pronunciationNote")}
          </p>
          <section className={s.section}>
            <h3>
              <span>01</span> {t("particlesTitle")}
            </h3>
            <table className={s.rulesTable}>
              <thead>
                <tr>
                  <th scope="col">{t("particle")}</th>
                  <th scope="col">{t("pronunciation")}</th>
                  <th scope="col">{t("keyboardInput")}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["は", "wa", "ha"],
                  ["へ", "e", "he"],
                  ["を", "o", "wo"],
                ].map(([kana, sound, input]) => (
                  <tr key={kana}>
                    <th scope="row" lang="ja">
                      {kana}
                    </th>
                    <td>{sound}</td>
                    <td>
                      <kbd>{input}</kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Example text="私は" spellings={["watashiha"]} />
            <p>
              {rich("particlesText")}
            </p>
          </section>
          <section className={s.section}>
            <h3>
              <span>02</span> {t("alternativesTitle")}
            </h3>
            <div className={s.examples}>
              <Example text="し" spellings={["shi", "si"]} />
              <Example text="ち" spellings={["chi", "ti"]} />
              <Example text="つ" spellings={["tsu", "tu"]} />
              <Example text="じ" spellings={["ji", "zi"]} />
            </div>
            <p>
              {t("alternativesText")}
            </p>
          </section>
          <section className={s.section}>
            <h3>
              <span>03</span> {t("smallKanaTitle")}
            </h3>
            <p>{rich("smallKanaText")}</p>
            <div className={s.examples}>
              <Example text="きって" spellings={["kitte"]} />
              <Example text="ざっし" spellings={["zasshi"]} />
            </div>
            <Example text="っ" spellings={["xtu", "ltu", "xtsu", "ltsu"]} />
            <Example text="ゃ" spellings={["xya", "lya"]} />
          </section>
          <section className={s.section}>
            <h3>
              <span>04</span> {t("nTitle")}
            </h3>
            <p>
              {rich("nText")}
            </p>
            <Example text="さんま" spellings={["sanma"]} />
            <Example text="しんよう" spellings={["shin'you", "shinnyou"]} />
            <Example text="みんな" spellings={["minna"]} />
            <p>
              {rich("minnaText")}
            </p>
            <div className={s.note}>
              <strong>{t("completionTitle")}</strong>
              {rich("completionText")}
            </div>
            <p>
              {rich("hyphenText")}
            </p>
          </section>
          <section className={s.section}>
            <h3>
              <span>05</span> {t("combinationsTitle")}
            </h3>
            <div className={s.examples}>
              <Example text="しゃ" spellings={["sha", "sya"]} />
              <Example text="ちゅ" spellings={["chu"]} />
              <Example text="にゃ" spellings={["nya"]} />
              <Example text="が" spellings={["ga"]} />
              <Example text="ぴょ" spellings={["pyo"]} />
            </div>
            <p>
              {rich("combinationsText")}
            </p>
          </section>
          <section className={s.section}>
            <h3>
              <span>06</span> {t("conventionsTitle")}
            </h3>
            <ul>
              <li>
                {rich("longVowelText")}
              </li>
              <li>{t("punctuationText")}</li>
              <li>{t("errorsText")}</li>
              <li>
                {rich("timerText")}
              </li>
              <li>{t("helpPauseText")}</li>
            </ul>
          </section>
          <p className={s.reference}>
            {t("reference")}
            <a
              href="https://www.microsoft.com/content/dam/microsoft/final/ja-jp/microsoft-brand/documents/mcaps-atlife-RE4xdJo.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("referenceLink")}
            </a>
          </p>
        </div>
      </dialog>
    </>
  );
}
