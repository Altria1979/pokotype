"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useModelCatalog } from "./useModelCatalog";
import {
  AI_PROVIDERS,
  isAiProvider,
  isValidModelId,
  type AiSettings,
} from "@/lib/ai-models";

type AiModelFieldsProps = {
  value: AiSettings;
  onChange: (value: AiSettings) => void;
  idPrefix: string;
};

export function AiModelFields({
  value,
  onChange,
  idPrefix,
}: AiModelFieldsProps) {
  const t = useTranslations("Models");
  const provider = AI_PROVIDERS[value.provider];
  const model = value.models[value.provider];

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-provider`}>{t("provider")}</label>
        <select
          id={`${idPrefix}-provider`}
          value={value.provider}
          aria-describedby={`${idPrefix}-provider-help`}
          onChange={(event) => {
            const nextProvider = event.target.value;
            if (!isAiProvider(nextProvider)) return;
            onChange({
              provider: nextProvider,
              models: {
                ...value.models,
                [value.provider]: isValidModelId(model)
                  ? model
                  : provider.defaultModel,
              },
            });
          }}
        >
          {Object.keys(AI_PROVIDERS).map((id) => (
            <option key={id} value={id}>{t(`providers.${id}`)}</option>
          ))}
        </select>
        <small id={`${idPrefix}-provider-help`}>
          {value.provider === "bailian"
            ? t("bailianHelp")
            : t("deepseekHelp")}
        </small>
      </div>
      <ModelFields
        key={value.provider}
        value={value}
        onChange={onChange}
        idPrefix={idPrefix}
      />
    </>
  );
}

function ModelFields({ value, onChange, idPrefix }: AiModelFieldsProps) {
  const t = useTranslations("Models");
  const provider = AI_PROVIDERS[value.provider];
  const model = value.models[value.provider];
  const catalog = useModelCatalog(value.provider);
  const models = catalog !== null
    ? catalog.map((id) => ({ id, name: provider.models.find((option) => option.id === id)?.name ?? id }))
    : provider.models;
  const isPreset = models.some((option) => option.id === model);
  const [editingCustom, setEditingCustom] = useState(!isPreset);
  const custom = editingCustom || !isPreset;

  function changeModel(nextModel: string) {
    onChange({
      ...value,
      models: { ...value.models, [value.provider]: nextModel },
    });
  }

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-model`}>{t("model")}</label>
        <select
          id={`${idPrefix}-model`}
          value={custom ? "__custom__" : model}
          aria-describedby={`${idPrefix}-model-help`}
          onChange={(event) => {
            const nextCustom = event.target.value === "__custom__";
            setEditingCustom(nextCustom);
            changeModel(nextCustom ? "" : event.target.value);
          }}
        >
          {models.map((option) => (
            <option key={option.id} value={option.id}>{option.id === "deepseek-v4-flash" ? t("compatibilityName") : option.name}</option>
          ))}
          <option value="__custom__">{t("custom")}</option>
        </select>
        <small id={`${idPrefix}-model-help`}>
          {catalog !== null
            ? t("synced", { count: catalog.length })
            : value.provider === "deepseek" && model === "deepseek-v4-flash"
            ? t("alias")
            : t("otherModel")}
        </small>
      </div>
      {custom && (
        <div className="field">
          <label htmlFor={`${idPrefix}-custom-model`}>{t("customId")}</label>
          <input
            id={`${idPrefix}-custom-model`}
            value={model}
            required
            maxLength={128}
            autoComplete="off"
            spellCheck={false}
            placeholder={provider.defaultModel}
            aria-invalid={model.length > 0 && !isValidModelId(model)}
            aria-describedby={`${idPrefix}-custom-model-help`}
            onChange={(event) => {
              setEditingCustom(true);
              changeModel(event.target.value.trim());
            }}
          />
          <small id={`${idPrefix}-custom-model-help`}>
            {t("customHelp")}
          </small>
        </div>
      )}
    </>
  );
}
