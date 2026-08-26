"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateSettingsAction } from "@/app/(app)/settings/actions";
import {
  Field,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/form/form-parts";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import type { AppSettings } from "@/lib/settings";

export function SettingsForm({
  settings,
  timeZones,
  currencies,
  locales,
}: {
  settings: AppSettings;
  timeZones: string[];
  currencies: string[];
  locales: string[];
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    updateSettingsAction,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const err = (name: string) => (state.ok ? undefined : state.fieldErrors?.[name]);

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-8 rounded-xl border bg-card p-6 shadow-xs">
        <FormSection
          title="Pharmacy"
          description="Used across the app for names, dates and prices."
        >
          <Field
            name="pharmacyName"
            label="Pharmacy name"
            required
            error={err("pharmacyName")}
          >
            {(props) => (
              <Input {...props} defaultValue={settings.pharmacyName} required />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="timeZone"
              label="Timezone"
              required
              error={err("timeZone")}
              hint="Decides when a batch expiring today changes status."
            >
              {(props) => (
                <>
                  <Input
                    {...props}
                    list="tz-options"
                    defaultValue={settings.timeZone}
                    required
                  />
                  <datalist id="tz-options">
                    {timeZones.map((tz) => (
                      <option key={tz} value={tz} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>

            <Field
              name="currency"
              label="Currency"
              required
              error={err("currency")}
              hint="ISO code, e.g. PHP."
            >
              {(props) => (
                <>
                  <Input
                    {...props}
                    list="currency-options"
                    defaultValue={settings.currency}
                    required
                  />
                  <datalist id="currency-options">
                    {currencies.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>

            <Field
              name="locale"
              label="Locale"
              required
              error={err("locale")}
              hint="Number and date formatting, e.g. en-PH."
            >
              {(props) => (
                <>
                  <Input
                    {...props}
                    list="locale-options"
                    defaultValue={settings.locale}
                    required
                  />
                  <datalist id="locale-options">
                    {locales.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Expiry thresholds"
          description="How far ahead a batch is flagged. Changing these takes effect immediately, everywhere."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="criticalDays"
              label="Critical window (days)"
              required
              error={err("criticalDays")}
              hint="Red-orange. Prioritise these for dispensing."
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={settings.expiry.criticalDays}
                  required
                />
              )}
            </Field>

            <Field
              name="warningDays"
              label="Warning window (days)"
              required
              error={err("warningDays")}
              hint="Amber. Watch, no action needed yet."
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={settings.expiry.warningDays}
                  required
                />
              )}
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Daily digest"
          description="An emailed summary of what is expiring, sent by the scheduled job."
        >
          <div className="flex items-start gap-3">
            <Checkbox
              id="digestEnabled"
              name="digestEnabled"
              defaultChecked={settings.digestEnabled}
            />
            <div className="space-y-1">
              <Label htmlFor="digestEnabled" className="font-normal">
                Send the daily expiry digest
              </Label>
              <p className="text-xs text-muted-foreground">
                The dashboard panel is always on. This is the extra email.
              </p>
            </div>
          </div>

          <Field
            name="digestRecipients"
            label="Recipients"
            error={err("digestRecipients")}
            hint="Comma-separated email addresses."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                defaultValue={settings.digestRecipients.join(", ")}
                placeholder="owner@happymed.ph, pharmacist@happymed.ph"
              />
            )}
          </Field>
        </FormSection>

        {!state.ok ? <FormError message={state.error} /> : null}
      </div>

      <div className="flex justify-end">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}
