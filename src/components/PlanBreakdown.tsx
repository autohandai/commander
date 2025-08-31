import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Circle, Clock, ArrowRight, Play } from 'lucide-react';

interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  estimatedTime?: string;
  dependencies?: string[];
  details?: string;
}

interface PlanBreakdownProps {
  title: string;
  description: string;
  steps: PlanStep[];
  progress: number;
  isGenerating?: boolean;
  onExecutePlan?: () => void;
  onExecuteStep?: (stepId: string) => void;
}

export function PlanBreakdown({ 
  title, 
  description, 
  steps, 
  progress, 
  isGenerating = false,
  onExecutePlan,
  onExecuteStep 
}: PlanBreakdownProps) {
  const getStatusIcon = (status: PlanStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: PlanStep['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500 text-white">Completed</Badge>;
      case 'in_progress':
        return <Badge variant="default" className="bg-blue-500 text-white">In Progress</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const calculatedProgress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : progress;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2">{title}</CardTitle>
            <p className="text-muted-foreground text-sm mb-4">{description}</p>
            
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Progress:</span>
                <Progress value={calculatedProgress} className="w-32" />
                <span className="text-xs text-muted-foreground">
                  {Math.round(calculatedProgress)}% ({completedSteps}/{totalSteps})
                </span>
              </div>
              
              {!isGenerating && totalSteps > 0 && (
                <Button 
                  onClick={onExecutePlan} 
                  size="sm" 
                  className="ml-auto"
                  disabled={completedSteps === totalSteps}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {completedSteps === totalSteps ? 'Plan Complete' : 'Execute Plan'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isGenerating ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span className="text-sm">Analyzing your request and breaking it down...</span>
            </div>
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {steps.map((step, index) => (
              <AccordionItem key={step.id} value={step.id} className="border rounded-lg mb-2 px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    {getStatusIcon(step.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{index + 1}. {step.title}</span>
                        {getStatusBadge(step.status)}
                        {step.estimatedTime && (
                          <Badge variant="outline" className="text-xs">
                            ~{step.estimatedTime}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {onExecuteStep && step.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExecuteStep(step.id);
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Execute
                        </Button>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                
                <AccordionContent className="pt-4 pb-2">
                  {step.details && (
                    <div className="bg-muted/30 rounded-md p-3 mb-3">
                      <h4 className="text-sm font-medium mb-2">Details:</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{step.details}</p>
                    </div>
                  )}
                  
                  {step.dependencies && step.dependencies.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium mb-2">Dependencies:</h4>
                      <div className="flex flex-wrap gap-2">
                        {step.dependencies.map((dep, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {dep}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {index < steps.length - 1 && (
                    <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                      <ArrowRight className="h-4 w-4" />
                      <span>Next: {steps[index + 1].title}</span>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}