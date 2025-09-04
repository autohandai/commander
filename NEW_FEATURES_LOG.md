Account management

Now let's make the integration of auth the user in the app, atm I have only a pseudo integration of the left [app-sidebar.tsx](src/components/app-sidebar.tsx)  but what i want is:


- When the app is loaded, check if the user has a valid license
- Checks if he is logged in on his account at Commander
- Logout of the account
- Integrated db with supabase for validation


Initialization

- checks if there are any previous configurations in ~/.commander/settings.json and load in the app
- check which cli agents the user has on the account and installed in their systems
- check if none of the supported one are installed they can see and install themselves in a intuitive ui




Claude CLI modifications


Claude supports native integrations for ui rendering the messages

DONE
/claude commands the way we're handling in [cli_commands.rs](src-tauri/src/commands/cli_commands.rs) is not helping us to create nice UI for the messages we have in the chat history, for claude, they support a bunch of options as param you can add to the cli, such as claude -p " WHAT THE USER TYPES" --output-format stream-json --verbose

This allows us to focus on what we want to build in the message itself, let's refactor the integration with /claude first as it's the default ai cli agent to parse the response and we print like I'm showing you in the ui image I'm sharing, for each message, the stream json allows us to in real time parse what the output is coming from the cli, and the [AgentResponse.tsx](src/components/chat/AgentResponse.tsx)  should be able to handle for any cli agent not just for claude.

Apply the TDD process, build a plan and let's work out how to make this work.


Workspace

now let's focus on the functionality of Enable workspace, The same we have here is not the same we have in [GitSettings.tsx](src/components/settings/GitSettings.tsx) ,remember workspace is our concept for Commander that uses git worktree, so, by default is enabled and users can see that in the GitSettings, we don't need to show this big button there, When I make enable and disable, in the GitSettings, means that whenever a user types a message and send it, you will verify if the user is working on a workspace directory under .commander/ sub folder in the repo if doesn't have one, you will ask the user to to create one, by asking how do I name it your workspace, then you create it, we have this feature implemented in the [CodeView.tsx](src/components/CodeView.tsx) but I want to make sure pops up a dialog asking the user the name of the feature they want to use, automatically you will compact the first 4 words of the user message to autoname the git worktree, using the appropriate name space like word-typed-by-user and automatically focus the cursor on the field, and the user will press create, automatically you will send the message to the cli, and in the [ChatInterface.tsx](src/components/ChatInterface.tsx) you will add two controls, one to the user nvigate to which git worktree (workspace ) they want and if they wish create a new workspace.

Keep in mind of the following:

- When a worktree is already in place you won't ask for another worktree, you will keep working directly and showing the user in the contorls you will add to chatInteface which workspace(git worktree) they're currently working. And a new button create workspace which will create a new git worktree based on what the user will type,  since they're initiating from the button, means they don't have any messages like the other use case, in this case, you will give a few random names taken from deserts across the world, you can make a little random dict from 50 probable, max 3 words though.
- When the user is working on any cli commands ai agents, they will be working on that directory workspace(git worktree created)
- Use TDD 
- Follow the architecture pattern strictly used by Tauri V2, best practices by Rust super star developers, 
- Don't duplicate any code, keep it DRY