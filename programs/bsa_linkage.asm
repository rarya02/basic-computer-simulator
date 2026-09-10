/ BSA stores the return address, hex operands address memory directly,
/ and a label may sit on a line of its own
        ORG 100
        BSA SUB         / M[SUB] <- 101, PC <- SUB + 1
        HLT
        ORG 180
SUB,    HEX 0           / Return address lands here
        LDA SUB
        STA 200
        LDA 200
        ADD ONE
        STA RET
DONE,
        HLT
ONE,    DEC 1
RET,    HEX 0
        END
