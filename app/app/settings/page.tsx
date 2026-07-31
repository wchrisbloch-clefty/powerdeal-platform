import { getUserSettings } from '@/lib/data';
import { isAdminConfigured } from '@/lib/supabase/admin';
import { envStatus } from '@/lib/env-check';
import { BRAIN_READY, BRAIN_ERROR } from '@/lib/prompts/system';
import SettingsPanel from '@/components/modules/settings-panel';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const settings = await getUserSettings();

  return (
    <SettingsPanel
      settings={settings}
      env={envStatus()}
      brainReady={BRAIN_READY}
      brainError={BRAIN_ERROR}
      canPersist={isAdminConfigured()}
    />
  );
}
