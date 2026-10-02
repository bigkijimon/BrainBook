// Test-only page for scripts/test-voice.mjs: the Office "Tell Bigkiji" box on its own, or with
// ?part=team the left-rail team sheet whose "Tell a member directly" box has its own mic.
// window.__remote (set by the test) renders the box as a paired phone sees it.
import { createRoot } from 'react-dom/client';
import { TeamRail } from '../../src/TeamRail';
import { VoiceCommand } from '../../src/VoiceInput';
import '../../src/styles.css';

const team = {
  id: 'app-dev', name: 'App Dev', label: 'App Development', live: false, specialists: [], work: [],
  members: [{ name: 'Bigkiji', role: 'routes', live: false }, { name: 'MiMo', role: 'builds', live: false, parent: 'Bigkiji' }],
  direct: ['Bigkiji', 'MiMo'],
};

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('part') === 'team'
  ? <TeamRail teams={[team]} allCount={0} onAll={() => {}} allActive={false} />
  : <VoiceCommand tone="#ff4fa3" remote={Boolean((window as unknown as { __remote?: boolean }).__remote)} />);
