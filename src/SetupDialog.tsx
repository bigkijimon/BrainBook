import { useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, Sparkles, X } from 'lucide-react';

export type SetupState = {
  vaultPath: string;
  vaultReady: boolean;
  configured: boolean;
  ownerName: string;
  suggestedVault: string;
  vaults: { path: string; name: string; source: string }[];
  hermes: boolean;
};

// First launch (and Settings): who you are and which Obsidian vault holds your ideas.
// A friend without Obsidian can let BrainBook create a fresh vault folder.
export function SetupDialog({ state, firstRun, onSave, onClose }: {
  state: SetupState;
  firstRun: boolean;
  onSave: (patch: { ownerName: string; vaultPath: string; create: boolean }) => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(state.ownerName);
  const initial = state.vaultReady ? state.vaultPath : state.vaults[0]?.path || state.suggestedVault;
  const [vault, setVault] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVault(state.vaultReady ? state.vaultPath : state.vaults[0]?.path || state.suggestedVault); }, [state]);
  const known = state.vaults.some((entry) => entry.path === vault) || (state.vaultReady && vault === state.vaultPath);
  const creating = !known;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    const problem = await onSave({ ownerName: name.trim(), vaultPath: vault.trim(), create: creating });
    setBusy(false);
    if (problem) setError(problem);
  };

  return <div className="setup-backdrop" role="presentation">
    <form className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title" onSubmit={submit}>
      {!firstRun && <button type="button" className="icon-button setup-close" aria-label="Close" onClick={onClose}><X size={16} /></button>}
      <span className="eyebrow">{firstRun ? 'WELCOME TO BRAINBOOK' : 'SETTINGS'}</span>
      <h2 id="setup-title">{firstRun ? 'Let’s set up your idea space' : 'Your idea space'}</h2>
      {firstRun && <p className="setup-lead">BrainBook keeps every idea as a Markdown note in an Obsidian vault on this Mac. Nothing leaves your computer.</p>}

      <label className="setup-field">
        <span>Your name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="What should BrainBook call you?" />
      </label>

      <fieldset className="setup-field">
        <legend>Where your ideas live</legend>
        {state.vaults.length > 0 && <div className="setup-vaults">
          {state.vaults.map((entry) => <button type="button" key={entry.path} className={`setup-vault ${vault === entry.path ? 'on' : ''}`} onClick={() => setVault(entry.path)}>
            <FolderOpen size={15} /><span><b>{entry.name}</b><small>{entry.path.replace(/^\/Users\/[^/]+/, '~')}</small></span>{vault === entry.path && <CheckCircle2 size={15} />}
          </button>)}
        </div>}
        <button type="button" className={`setup-vault ${vault === state.suggestedVault ? 'on' : ''}`} onClick={() => setVault(state.suggestedVault)}>
          <Sparkles size={15} /><span><b>Start a new vault</b><small>{state.suggestedVault.replace(/^\/Users\/[^/]+/, '~')}</small></span>{vault === state.suggestedVault && <CheckCircle2 size={15} />}
        </button>
        <input className="setup-path" value={vault} onChange={(event) => setVault(event.target.value)} spellCheck={false} aria-label="Vault folder path" />
        <small className="setup-hint">{creating ? 'This folder will be created. Open it in Obsidian later with “Open folder as vault”.' : 'Ideas are saved in its “ideas” folder. Other notes are only read.'}</small>
      </fieldset>

      {!state.hermes && <p className="setup-note">Hermes is not installed on this Mac, so the built-in terminal stays off. Everything else works. Install Hermes and reopen BrainBook to turn it on.</p>}
      {error && <p className="setup-error" role="alert">{error}</p>}
      <div className="setup-actions">
        <button className="primary-button" type="submit" disabled={busy || !vault.trim()}>{busy ? 'Saving…' : firstRun ? 'Start BrainBook' : 'Save'}</button>
      </div>
    </form>
  </div>;
}
