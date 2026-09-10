/ Two's complement subtraction in both directions: D1 = A - B, D2 = B - A
        ORG 100
        LDA B           / AC <- B
        CMA
        INC             / AC <- -B
        ADD A           / AC <- A - B, E <- carry (1 when A >= B)
        STA D1
        LDA A
        CMA
        INC             / AC <- -A
        ADD B           / AC <- B - A (negative result, no carry)
        STA D2
        HLT
A,      DEC 83
B,      DEC 23
D1,     HEX 0
D2,     HEX 0
        END
