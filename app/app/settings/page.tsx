import { getUserSettings } from '@/lib/data';
import { getUser } from '@/lib/supabase/server';
import { getActiveVertical } from '@/lib/active-vertical';
import { envStatus } from '@/lib/env-check';
import { BRAIN_READY, BRAIN_ERROR } from '@/lib/prompts/system';
import SettingsPanel from '@/components/modules/settings-panel';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const [settings, user] = await Promise.all([getUserSettings(), getUser()]);

  return (
    <SettingsPanel
      settings={settings}
      vertical={getActiveVertical()}
      env={envStatus()}
      brainReady={BRAIN_READY}
      brainError={BRAIN_ERROR}
      signedIn={Boolean(user)}
    />
  );
}
