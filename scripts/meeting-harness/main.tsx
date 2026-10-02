// Test-only page for scripts/test-meeting-render.mjs: mounts MeetingRoom on its own so the
// collapsed-row heading and the expanded full-topic block can be asserted against real rendered
// DOM, not just the summarize() unit in isolation (meeting.mjs).
import { createRoot } from 'react-dom/client';
import { MeetingRoom } from '../../src/MeetingRoom';
import '../../src/styles.css';

createRoot(document.getElementById('root')!).render(<MeetingRoom remote={false} />);
