// @ts-nocheck
const parsedTransactionOutput = (parsedInstruction, txn) => {
  let output = {};
  const name = parsedInstruction.instructions.find(
    (instruction) => instruction.name === "initialize"
  );
  if (!name) return;
  output = {
    ...txn,
    meta: {
      ...txn.meta,
      innerInstructions: parsedInstruction.inner_ixs,
    },
    transaction: {
      ...txn.transaction,
      message: {
        ...txn.transaction.message,
        compiledInstructions: parsedInstruction.instructions,
      },
    },
  };
  return output;
};

export default parsedTransactionOutput;
