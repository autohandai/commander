// Simple test to check if sub-agents are loading correctly
// Run this in the browser console when the app is running

async function testSubAgents() {
  try {
    // Test loading all sub-agents
    const allAgents = await window.__TAURI__.invoke('load_all_sub_agents');
    console.log('All sub-agents:', allAgents);
    console.log('Total sub-agents found:', allAgents.length);
    
    // Test loading sub-agents grouped by CLI
    const groupedAgents = await window.__TAURI__.invoke('load_sub_agents_grouped');
    console.log('Grouped sub-agents:', groupedAgents);
    
    // Test loading sub-agents for specific CLI
    const claudeAgents = await window.__TAURI__.invoke('load_sub_agents_for_cli', { cliName: 'claude' });
    console.log('Claude sub-agents:', claudeAgents);
    
    // Display summary
    console.log('\n=== Summary ===');
    for (const [cli, agents] of Object.entries(groupedAgents)) {
      console.log(`${cli}: ${agents.length} agents`);
      agents.forEach(agent => {
        console.log(`  - ${agent.name}: ${agent.description.substring(0, 50)}...`);
      });
    }
  } catch (error) {
    console.error('Error testing sub-agents:', error);
  }
}

// Run the test
testSubAgents();