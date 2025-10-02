import {
  VeltComments, VeltCommentsSidebar, VeltCommentsSidebarButton,
  VeltCommentTool, VeltPresence, VeltProvider
} from '@veltdev/react'
import './App.css'
import BabylonScene from './components/BabylonScene'
import VeltCollaboration from './velt-components/VeltCollaboration'

function App() {
  return (
    <VeltProvider
      apiKey={'Emcfab4ysRXaC1CZ8hmG'}
    >
      <VeltComments />
      <VeltCommentsSidebar pageMode={true} />
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">Velt BabylonJS App</h1>
          <div className="login-section">
            <VeltCommentsSidebarButton />
            <VeltCommentTool darkMode={true} />
            <VeltPresence />
            <VeltCollaboration />
          </div>
        </header>
        <main className="app-content">
          <BabylonScene />
        </main>
      </div>
    </VeltProvider>
  )
}

export default App
