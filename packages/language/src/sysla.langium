grammar Sysla

entry Model:
    (signals+=Signal | components+=Component)*;

Signal:
    'Signal' name=ID;

Component:
    'Component' name=ID
    (ports+=PartPort | parts+=PartComponent | delegations+=Delegation | connections+=Connection)*;

PartComponent:
    'Part' component=[Component:ID] instance=Instance;

PartPort:
    port=Port 
    (
        (output?='Output' | input?='Input' | bidirectional?='Bidirectional') 
        signal=[Signal:ID]
    )?;

Port:
    'Port' name=ID
    ('[' subports+=Port ']')*;

Instance:
    'as' name=ID;

Connection:
    'Connection' components1=[Instance:ID] ':' port1=[Port:ID] '-' components2=[Instance:ID] ':' port2=[Port:ID];

Delegation:
    'Delegation' port1=[Port:ID] '-' components2=[Instance:ID] ':' port2=[Port:ID];

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w]*/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
