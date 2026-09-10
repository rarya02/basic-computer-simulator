/ Sum the integers 1 through 10 with an ISZ loop counter
        ORG 100
LOP,    LDA SUM
        ADD N
        STA SUM
        LDA N
        INC
        STA N
        ISZ CNT
        BUN LOP
        HLT
N,      DEC 1
SUM,    DEC 0
CNT,    DEC -10
        END
