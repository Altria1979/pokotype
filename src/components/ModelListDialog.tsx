"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import s from "./ModelListDialog.module.css";

export function ModelListDialog({ providerName, models }: {
  providerName: string;
  models: readonly string[];
}) {
  const t = useTranslations("Models");
  const format = useFormatter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnHistoryChange = () => dialog.current?.close();
    window.addEventListener("popstate", closeOnHistoryChange);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("popstate", closeOnHistoryChange);
    };
  }, [open]);

  function close() {
    dialog.current?.close();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={s.trigger}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          if (content.current) content.current.scrollTop = 0;
          closeButton.current?.focus({ preventScroll: true });
          setOpen(true);
        }}
      >
        {t("viewList")}
      </button>
      <dialog
        ref={dialog}
        className={s.dialog}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right ||
              event.clientY < rect.top || event.clientY > rect.bottom) close();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.shiftKey && document.activeElement === closeButton.current) {
            event.preventDefault();
            content.current?.focus();
          } else if (!event.shiftKey && document.activeElement === content.current) {
            event.preventDefault();
            closeButton.current?.focus();
          }
        }}
      >
        <div className={s.header}>
          <div>
            <h2 id={titleId}>{t("listTitle", { provider: providerName })}</h2>
            <p>{t("listCount", { count: models.length })}</p>
          </div>
          <button ref={closeButton} type="button" className={s.closeButton} aria-label={t("closeList")} onClick={close}>
            {t("close")} <span aria-hidden="true">×</span>
          </button>
        </div>
        <div ref={content} className={s.content} role="region" aria-label={t("list")} tabIndex={0}>
          <ul className={s.models}>
            {models.map((model, index) => (
              <li key={model}>
                <span className={s.number} aria-hidden="true">{format.number(index + 1)}</span>
                <code>{model}</code>
              </li>
            ))}
          </ul>
        </div>
        <p className={s.note}>{t("listNote")}</p>
      </dialog>
    </>
  );
}
