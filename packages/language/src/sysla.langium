grammar Sysla

entry Model:
    (signals+=Signal | components+=Component | machines+=MachineDefinition | functions+=FunctionDefinition | scenarios+=ScenarioDefinition | contexts+=FunctionalContext)*;

Signal:
    'Signal' name=Name ('[' values+=SignalValue (',' values+=SignalValue)* ']')? ('as' event?='Event')?;

Component:
    'Component' name=Name
    (ports+=PartPort | parts+=PartComponent | delegations+=Delegation | connections+=Connection
    | events+=EventDeclaration | machines+=MachineDeclaration | functions+=FunctionDeclaration | scenarios+=ScenarioDeclaration)*;

PartComponent:
    'Part' component=[Component:Name] instance=Instance;

PartPort:
    port=Port 
    (
        (output?='Output' | input?='Input' | bidirectional?='Bidirectional') 
        signal=[Signal:Name]
    )?;

Port:
    'Port' name=Name
    ('[' subports+=Port ']')*;

Instance:
    'as' name=Name;

Connection:
    'Connection' components1=[Instance:Name] ':' port1=[Port:Name] '-' components2=[Instance:Name] ':' port2=[Port:Name];

Delegation:
    'Delegation' port1=[Port:Name] '-' components2=[Instance:Name] ':' port2=[Port:Name];

type Trigger = EventDeclaration | Signal;
EventDeclaration: 'Event' name=Name ('from' part=[Instance:Name] '.' source=[EventDeclaration:Name])?;
SignalValue: name=Name;
MachineDeclaration: MACHINE_KEYWORD name=Name;
FunctionDeclaration:
    FUNCTION_KEYWORD name=Name '('
        (parameters+=Parameter (',' parameters+=Parameter)*)? ')' ('returns' result=ValueType)? (query?='query')?
    ('requires' requirements+=StateRequirement ('or' requirements+=StateRequirement)*)?;
Parameter: name=Name ':' valueType=ValueType;
ValueType: boolean?='Boolean' | signal=[Signal:TypeName];
type Binding = Receive | Parameter;
StateRequirement: machine=[MachineDeclaration:Name] '.' state=[State:Name];

MachineDefinition:
    MACHINE_HEADER owner=[Component:Name] '.' declaration=[MachineDeclaration:Name]
    'Initial' initial=[State:Name] (states+=State | transitions+=Transition)*;
State: 'State' name=Name (actions+=StateAction)*;
StateAction: kind=('Entry' | 'Do' | 'Exit') callee=[FunctionDeclaration:Name];
Transition: 'Transition' source=[State:Name] '->' target=[State:Name] 'on' trigger=[Trigger:Name] ('[' guard=Guard ']')?
    ('/' effect=[FunctionDeclaration:Name] '(' ')')?;
Guard: part=[Instance:Name] '.' operation=[FunctionDeclaration:Name] '(' ')';

FunctionDefinition:
    FUNCTION_HEADER owner=[Component:Name] '.' declaration=[FunctionDeclaration:Name] (steps+=Step)*;
Step: Receive | Choice | Call | Emit | ParallelCalls | Loop | Conditional;
Loop: 'Loop' steps+=Step+ 'EndLoop';
Conditional: 'If' condition=QueryInvocation steps+=Step+ 'EndIf';
QueryInvocation: callee=[FunctionDeclaration:Name] '(' (argument=[Binding:Name] (',' additionalArguments+=[Binding:Name])*)? ')';
ParallelCalls: 'Parallel' calls+=Call calls+=Call (calls+=Call)* 'Join';
Receive: 'Receive' signal=[Signal:Name] 'at' port=[Port:Name] 'as' name=Name;
Choice: 'Case' binding=[Binding:Name] branches+=Branch+;
Branch: value=[SignalValue:Name] '->' action=Emit;
Emit: 'Emit' event=[EventDeclaration:Name];
Call: 'Call' callee=[FunctionDeclaration:Name] (parentheses?='(' (argument=[Binding:Name] (',' additionalArguments+=[Binding:Name])*)? ')')?;

ScenarioDeclaration: SCENARIO_KEYWORD name=Name;
ScenarioDefinition:
    SCENARIO_HEADER owner=[Component:Name] '.' declaration=[ScenarioDeclaration:Name] steps+=ScenarioStep+;
ScenarioStep: ScenarioAction | ParallelBlock;
ParallelBlock: 'Parallel' actions+=ScenarioAction actions+=ScenarioAction (actions+=ScenarioAction)* 'Join';
ScenarioAction: part=[Instance:Name] '.' callee=[FunctionDeclaration:Name];

FunctionalContext:
    CONTEXT_HEADER owner=[Component:Name] '.' name=Name 'for' subject=[Instance:Name]
    interactions+=Interaction+;
Interaction: neighbor=[Instance:Name] direction=('<->' | '->' | '<-') operation=[FunctionDeclaration:Name];

// Keep identifiers from older models usable when introducing behavior keywords.
Name returns string: 'Boolean' | TypeName;
TypeName returns string: ID | 'Event' | MACHINE_KEYWORD | 'Initial' | 'State'
    | 'Transition' | 'on' | 'Receive' | 'at' | 'Case' | 'Emit' | 'Call' | 'requires' | 'or' | SCENARIO_KEYWORD | 'Parallel' | 'Join' | 'Entry' | 'Do' | 'Exit' | FUNCTION_KEYWORD | 'returns' | 'query' | 'Loop' | 'EndLoop' | 'If' | 'EndIf' | 'from' | 'for' | CONTEXT_KEYWORD;

hidden terminal WS: /\s+/;
terminal MACHINE_HEADER: /StateMachine\b(?=(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*[_a-zA-Z]\w*(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*\.)/;
terminal MACHINE_KEYWORD: /StateMachine\b/;
terminal FUNCTION_HEADER: /Function\b(?=(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*[_a-zA-Z]\w*(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*\.)/;
terminal FUNCTION_KEYWORD: /Function\b/;
terminal SCENARIO_HEADER: /Scenario\b(?=(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*[_a-zA-Z]\w*(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*\.)/;
terminal SCENARIO_KEYWORD: /Scenario\b/;
terminal CONTEXT_HEADER: /FunctionalContext\b(?=(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*[_a-zA-Z]\w*(?:\s|\/\/[^\n\r]*[\r\n]|\/\*[\s\S]*?\*\/)*\.)/;
terminal CONTEXT_KEYWORD: /FunctionalContext\b/;
terminal ID: /[_a-zA-Z][\w]*/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
