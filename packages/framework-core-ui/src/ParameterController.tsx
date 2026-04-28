import { useCallback, useEffect, useRef, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Select from "@radix-ui/react-select";
import * as Label from "@radix-ui/react-label";
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
  if (config.type === "number") return "slider";
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

  // Track whether this is the first render to avoid publishing on mount
  const isMounted = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset values when parameters config changes
  useEffect(() => {
    if (parameters && Object.keys(parameters).length > 0) {
      setValues(initialValues(parameters));
    } else {
      setValues({});
    }
    isMounted.current = false;
  }, [parameters]);

  // Mark as mounted after first render
  useEffect(() => {
    isMounted.current = true;
  }, []);

  const publishValues = useCallback(
    (nextValues: Record<string, number | string>) => {
      publish(channel, nextValues);
    },
    [channel, publish],
  );

  const handleChange = useCallback(
    (key: string, value: number | string, debounce = false) => {
      const nextValues = { ...values, [key]: value };
      setValues(nextValues);

      if (!isMounted.current) return;

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
    return (
      <div className={`${PREFIX}-empty`} data-testid="parameter-controller-empty">
        No parameters configured
      </div>
    );
  }

  return (
    <div className={`${PREFIX}-container`} data-testid="parameter-controller">
      {Object.entries(parameters).map(([key, config]) => {
        const widget = resolveWidget(config);
        const value = values[key] ?? config.default;

        return (
          <div
            key={key}
            className={`${PREFIX}-row`}
            data-testid={`parameter-row-${key}`}
          >
            <Label.Root className={`${PREFIX}-label`} htmlFor={`param-${key}`}>
              {config.title}
            </Label.Root>

            <div className={`${PREFIX}-control`}>
              {widget === "slider" && (
                <div className={`${PREFIX}-slider-wrapper`}>
                  <Slider.Root
                    id={`param-${key}`}
                    className={`${PREFIX}-slider-root`}
                    min={config.minimum ?? 0}
                    max={config.maximum ?? 100}
                    step={config.multipleOf ?? 1}
                    value={[value as number]}
                    onValueChange={([v]) => handleChange(key, v, true)}
                    data-testid={`slider-${key}`}
                  >
                    <Slider.Track className={`${PREFIX}-slider-track`}>
                      <Slider.Range className={`${PREFIX}-slider-range`} />
                    </Slider.Track>
                    <Slider.Thumb className={`${PREFIX}-slider-thumb`} />
                  </Slider.Root>
                  <span
                    className={`${PREFIX}-value`}
                    data-testid={`slider-value-${key}`}
                  >
                    {(value as number).toLocaleString()}
                  </span>
                </div>
              )}

              {widget === "input" && (
                <input
                  id={`param-${key}`}
                  className={`${PREFIX}-input`}
                  type="number"
                  min={config.minimum}
                  max={config.maximum}
                  step={config.multipleOf}
                  value={value as number}
                  onChange={(e) => handleChange(key, e.target.valueAsNumber)}
                  data-testid={`input-${key}`}
                />
              )}

              {widget === "select" && (
                <Select.Root
                  value={value as string}
                  onValueChange={(v) => handleChange(key, v)}
                >
                  <Select.Trigger
                    id={`param-${key}`}
                    className={`${PREFIX}-select-trigger`}
                    data-testid={`select-${key}`}
                  >
                    <Select.Value />
                    <Select.Icon className={`${PREFIX}-select-icon`}>▾</Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className={`${PREFIX}-select-content`}>
                      <Select.Viewport>
                        {config.enum?.map((option) => (
                          <Select.Item
                            key={option}
                            value={option}
                            className={`${PREFIX}-select-item`}
                            data-testid={`select-option-${option}`}
                          >
                            <Select.ItemText>{option}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
