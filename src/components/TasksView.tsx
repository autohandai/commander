import { useState } from 'react';
import { Plus, MoreHorizontal, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RecentProject } from '@/hooks/use-recent-projects';
import { TaskCreationModal } from '@/components/TaskCreationModal';

interface TasksViewProps {
  project: RecentProject;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignedAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

interface KanbanColumnProps {
  title: string;
  status: Task['status'];
  tasks: Task[];
  onTaskMove: (taskId: string, newStatus: Task['status']) => void;
  onTaskCreate: (status: Task['status']) => void;
}

function TaskCard({ task, onTaskMove }: { task: Task; onTaskMove: (taskId: string, newStatus: Task['status']) => void }) {
  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      'day'
    );
  };

  return (
    <Card className="mb-3 cursor-pointer hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-medium leading-tight">{task.title}</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onTaskMove(task.id, 'todo')}>
                Move to To Do
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTaskMove(task.id, 'in-progress')}>
                Move to In Progress
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTaskMove(task.id, 'done')}>
                Move to Done
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {task.description}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} />
            <Badge variant="secondary" className="text-xs">
              {task.assignedAgent}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(task.updatedAt)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({ title, status, tasks, onTaskMove, onTaskCreate }: KanbanColumnProps) {
  const getColumnColor = () => {
    switch (status) {
      case 'todo': return 'border-t-blue-500';
      case 'in-progress': return 'border-t-yellow-500';
      case 'done': return 'border-t-green-500';
      default: return 'border-t-gray-500';
    }
  };

  return (
    <div className={`flex-1 min-w-[280px] max-w-[320px]`}>
      <Card className={`h-full border-t-2 ${getColumnColor()}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              <Badge variant="outline" className="text-xs">
                {tasks.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTaskCreate(status)}
              className="h-6 w-6 p-0"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-3">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onTaskMove={onTaskMove}
                />
              ))}
              {tasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="mb-2">No tasks yet</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTaskCreate(status)}
                    className="text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add task
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export function TasksView({ project }: TasksViewProps) {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalInitialStatus, setTaskModalInitialStatus] = useState<Task['status']>('todo');

  // Mock data for demonstration
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Implement authentication system',
      description: 'Add user login, registration, and session management with JWT tokens',
      status: 'in-progress',
      priority: 'high',
      assignedAgent: 'Claude Code CLI',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
    {
      id: '2',
      title: 'Fix TypeScript compilation errors',
      description: 'Resolve remaining type issues in the components directory',
      status: 'todo',
      priority: 'medium',
      assignedAgent: 'Codex',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 30 * 60 * 1000),
    },
    {
      id: '3',
      title: 'Add dark mode toggle',
      description: 'Implement theme switching functionality with system preference detection',
      status: 'done',
      priority: 'low',
      assignedAgent: 'Gemini',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  ]);

  const handleTaskMove = (taskId: string, newStatus: Task['status']) => {
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === taskId
          ? { ...task, status: newStatus, updatedAt: new Date() }
          : task
      )
    );
  };

  const handleTaskCreate = (status: Task['status']) => {
    setTaskModalInitialStatus(status);
    setIsTaskModalOpen(true);
  };

  const handleTaskCreated = (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTask: Task = {
      id: Date.now().toString(),
      ...taskData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setTasks(prevTasks => [...prevTasks, newTask]);
  };

  const todoTasks = tasks.filter(task => task.status === 'todo');
  const inProgressTasks = tasks.filter(task => task.status === 'in-progress');
  const doneTasks = tasks.filter(task => task.status === 'done');

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage tasks for {project.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Clock className="h-4 w-4 mr-2" />
              History
            </Button>
            <Button size="sm" onClick={() => setIsTaskModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 p-4">
        <div className="flex gap-4 h-full overflow-x-auto">
          <KanbanColumn
            title="To Do"
            status="todo"
            tasks={todoTasks}
            onTaskMove={handleTaskMove}
            onTaskCreate={handleTaskCreate}
          />
          <KanbanColumn
            title="In Progress"
            status="in-progress"
            tasks={inProgressTasks}
            onTaskMove={handleTaskMove}
            onTaskCreate={handleTaskCreate}
          />
          <KanbanColumn
            title="Done"
            status="done"
            tasks={doneTasks}
            onTaskMove={handleTaskMove}
            onTaskCreate={handleTaskCreate}
          />
        </div>
      </div>

      <TaskCreationModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onTaskCreate={handleTaskCreated}
        initialStatus={taskModalInitialStatus}
      />
    </div>
  );
}