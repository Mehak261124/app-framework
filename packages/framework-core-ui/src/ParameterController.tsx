import { useCallback, useEffect, useRef, useState } from "react";
import { Field } from "@base-ui/react/field";
import { Label } from "./components/ui/label";
import { Slider } from "./components/ui/slider";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { usePublish } from "./usePublish";
import "./ParameterController.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParameterType = "string" | "number";
export type ParameterWidget = "slider" | "input" | "select";

export interface ParameterConfig {
  /** Display label shown above the control. */
  title: string;
  /** JSON schema type. */
  type: ParameterType;
  /** Default value applied on mount. */
  default: number | string;
  /** Minimum value — for slider and number input. */
  minimum?: number;
  /** Maximum value — for slider and number input. */
  maximum?: number;
  /** Step increment — for slider and number input. */
  multipleOf?: number;
  /** Options list — for select. */
  enum?: string[];
  /** Widget rendering options. */
  "x-options"?: {
    widget?: ParameterWidget;
  };
}

export interface ParameterControllerProps {
  /**
   * EventBus channel to publish parameter updates to.
   * Default: "params/control"
   */
  channel?: string;
  /**
   * Parameter definitions keyed by parameter name.
   * The key is used as the field name in the published payload.
   */
  parameters?: Record<string, ParameterConfig>;
  /**
   * Debounce delay in milliseconds for slider controls.
   * Default: 300
   */
  debounceMs?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveWidget(config: ParameterConfig): ParameterWidget {
  const explicit = config["x-options"]?.widget;
  if (explicit) return explicit;
  if (config.enum) return "select";
  return "input";
}

function initialValues(
  parameters: Record<string, ParameterConfig>,
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  for (const [key, config] of Object.entries(parameters)) {
    result[key] = config.default;
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PREFIX = "sct-ParameterController";

export function ParameterControllerComponent({
  channel = "params/control",
  parameters,
  debounceMs = 300,
}: ParameterControllerProps) {
  const publish = usePublish();
  const [values, setValues] = useState<Record<string, number | string>>(() =>
    parameters && Object.keys(parameters).length > 0 ? initialValues(parameters) : {},
  );

  const hasInteracted = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset values and interaction flag when parameters config changes
  useEffect(() => {
    hasInteracted.current = false;
    if (parameters && Object.keys(parameters).length > 0) {
      setValues(initialValues(parameters));
    } else {
      setValues({});
    }
  }, [parameters]);

  // Clean up any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const publishValues = useCallback(
    (nextValues: Record<string, number | string>) => {
      publish(channel, nextValues);
    },
    [channel, publish],
  );

  const handleChange = useCallback(
    (key: string, value: number | string, debounce = false) => {
      hasInteracted.current = true;
      const nextValues = { ...values, [key]: value };
      setValues(nextValues);

      if (debounce) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          publishValues(nextValues);
        }, debounceMs);
      } else {
        publishValues(nextValues);
      }
    },
    [values, debounceMs, publishValues],
  );

  if (!parameters || Object.keys(parameters).length === 0) {
    return <div className={`${PREFIX}-empty`}>No parameters configured</div>;
  }

  return (
    <div className={`${PREFIX}-container`}>
      {Object.entries(parameters).map(([key, config]) => {
        const widget = resolveWidget(config);
        const value = values[key] ?? config.default;

        return (
          <div key={key} className={`${PREFIX}-row`}>
            <Label htmlFor={`param-${key}`} className={`${PREFIX}-label`}>
              {config.title}
            </Label>

            <div className={`${PREFIX}-control`}>
              {widget === "slider" && (
                <div className={`${PREFIX}-slider-wrapper`}>
                  <Slider
                    id={`param-${key}`}
                    aria-label={config.title}
                    min={config.minimum ?? 0}
                    max={config.maximum ?? 100}
                    step={config.multipleOf ?? 1}
                    value={[value as number]}
                    onValueChange={(newValue) => {
                      const v = Array.isArray(newValue) ? newValue[0] : newValue;
                      handleChange(key, v, true);
                    }}
                  />
                  <span className={`${PREFIX}-value`}>
                    {(value as number).toLocaleString()}
                  </span>
                </div>
              )}

              {widget === "input" && (
                // @base-ui/react/input requires a Field ancestor for its
                // internal useFieldRootContext hook.
                <Field.Root>
                  <Input
                    id={`param-${key}`}
                    aria-label={config.title}
                    className={`${PREFIX}-input`}
                    type="number"
                    min={config.minimum}
                    max={config.maximum}
                    step={config.multipleOf}
                    value={value as number}
                    onChange={(e) => handleChange(key, e.target.valueAsNumber)}
                  />
                </Field.Root>
              )}

              {widget === "select" && (
                <Select
                  value={value as string}
                  onValueChange={(v: string | null) =>
                    v !== null && handleChange(key, v)
                  }
                >
                  <SelectTrigger
                    id={`param-${key}`}
                    aria-label={config.title}
                    className={`${PREFIX}-select-trigger`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.enum?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
