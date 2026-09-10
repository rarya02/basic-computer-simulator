/ Multiply two positive numbers by shift and add (Mano, Table 6-14)
        ORG 100
LOP,    CLE             / Clear E
        LDA Y           / Load multiplier
        CIR             / Transfer multiplier bit to E
        STA Y           / Store shifted multiplier
        SZE             / Check if bit is zero
        BUN ONE         / Bit is one, go to ONE
        BUN ZRO         / Bit is zero, go to ZRO
ONE,    LDA X           / Load multiplicand
        ADD P           / Add to partial product
        STA P           / Store partial product
        CLE             / Clear E
ZRO,    LDA X           / Load multiplicand
        CIL             / Shift left
        STA X           / Store shifted multiplicand
        ISZ CTR         / Increment counter
        BUN LOP         / Counter not zero, repeat loop
        HLT             / Counter is zero, halt
CTR,    DEC -8          / Counter
X,      HEX 000F        / Multiplicand
Y,      HEX 000B        / Multiplier
P,      HEX 0           / Product
        END
