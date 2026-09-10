/ Same result as double_add.asm with redundant work and delay loops,
/ used to compare profiler statistics
        ORG 100
        CLA
        LDA AL
        ADD BL
        STA SUM1
DELAY1, ISZ COUNT1
        BUN DELAY1
        STA TEMP
        LDA TEMP
        ADD ZERO
        STA CL
        CLA
        CIL
        LDA AH
        STA TEMP2
        LDA BH
        ADD TEMP2
        STA SUM2
DELAY2, ISZ COUNT2
        BUN DELAY2
        ADD ZERO
        STA CH
        HLT
ZERO,   DEC 0
SUM1,   DEC 0
SUM2,   DEC 0
TEMP,   DEC 0
TEMP2,  DEC 0
COUNT1, DEC -2
COUNT2, DEC -3
AL,     DEC 12
AH,     DEC 32
BL,     DEC 40
BH,     DEC 2
CL,     DEC 0
CH,     DEC 0
        END
