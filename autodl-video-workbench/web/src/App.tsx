import { useState } from 'react';
import JobList from './JobList';
import JobDetail from './JobDetail';

export default function App() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  return selectedJobId
    ? <JobDetail jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />
    : <JobList onOpen={setSelectedJobId} />;
}
