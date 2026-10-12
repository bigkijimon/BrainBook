// One folded, keyboard-accessible glossary; closed by default to keep the console compact.
export function TermsHelp() {
  return <details className="console-source terms-help"><summary>Terms explained</summary><dl>
    <dt>Model</dt><dd>The AI engine. <b>Set model</b> is saved settings; <b>Seen in session</b> is evidence from a recorded run. Neither proves a card used that model.</dd>
    <dt>Session</dt><dd>One chat or work run. It can be active without a card.</dd>
    <dt>Card</dt><dd>A tracked work item. Card counts are separate from active agents.</dd>
    <dt>Profile</dt><dd>Saved agent settings.</dd>
    <dt>GPU</dt><dd>A chip used for image and video work.</dd>
    <dt>QA</dt><dd>A quality check.</dd>
    <dt>Activity record</dt><dd>The last recorded agent activity, with its read time. It is not a count of all current jobs.</dd>
    <dt>Auto advance</dt><dd>The existing automatic goal-step service. Turning a display open or closed does not change it.</dd>
    <dt>Vault</dt><dd>Your folder of Obsidian notes.</dd>
  </dl></details>;
}
