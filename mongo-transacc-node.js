    const { MongoClient } = require("mongodb");
    const { v4: uuidv4 } = require('uuid');
    require('dotenv').config();

    const client = new MongoClient(process.env.MONGO_URI);

    // Collections
    const accounts = client.db("bank").collection("accounts");
    const transfers = client.db("bank").collection("transfers");

    // Account information
    let account_id_sender = "MDB574189300";
    let account_id_receiver = "MDB343652528";
    let transaction_amount = 100;
    let deposit_amount = 20000; // Set the amount you want to deposit

    // Start the client session
    const session = client.startSession();

    // Use withTransaction to start a transaction, execute the callback, and commit the transaction
    // The callback for withTransaction must be async/await
    // Note: Each individual operation must be awaited and have the session passed in as an argument
    const main = async () => {
    try {
        const transactionResults = await session.withTransaction(async () => {
        // Step 0: Deposit money into the sender's account
        const depositResults = await accounts.updateOne(
            { account_id: account_id_sender },
            { $inc: { balance: deposit_amount } },
            { session }
        );

        console.log(
            `${depositResults.matchedCount} document(s) matched the filter, updated ${depositResults.modifiedCount} document(s) for deposit into the sender account.`
        );

        // Step 1: Validate sender's balance
        const senderBalance = await accounts.findOne(
            { account_id: account_id_sender },
            { session }
        );

        if (!senderBalance || senderBalance.balance < transaction_amount) {
            throw new Error("Insufficient funds for the transaction.");
        }

        // Step 2: Update the account sender balance
        const updateSenderResults = await accounts.updateOne(
            { account_id: account_id_sender },
            { $inc: { balance: -transaction_amount } },
            { session }
        );

        // Step 3: Update the account receiver balance
        const updateReceiverResults = await accounts.updateOne(
            { account_id: account_id_receiver },
            { $inc: { balance: transaction_amount } },
            { session }
        );

        // Step 4: Insert the transfer document
        const transfer = {
            transfer_id: uuidv4(),
            amount: transaction_amount,
            from_account: account_id_sender,
            to_account: account_id_receiver,
        };

        const insertTransferResults = await transfers.insertOne(transfer, {
            session,
        });

        // Step 5: Update the transfers_complete field for the sender account
        const updateSenderTransferResults = await accounts.updateOne(
            { account_id: account_id_sender },
            { $push: { transfers_complete: transfer.transfer_id } },
            { session }
        );

        // Step 6: Update the transfers_complete field for the receiver account
        const updateReceiverTransferResults = await accounts.updateOne(
            { account_id: account_id_receiver },
            { $push: { transfers_complete: transfer.transfer_id } },
            { session }
        );

        console.log("Committing transaction ...");
        // If the callback for withTransaction returns successfully without throwing an error, the transaction will be committed
        return true;
        });

        if (transactionResults) {
        console.log("The transaction was successfully created.");
        } else {
        console.log("The transaction was intentionally aborted.");
        }
    } catch (err) {
        console.error(`Transaction aborted: ${err}`);
        // Handle the error appropriately (e.g., log more details or notify someone)
        // Do not exit the process here
    } finally {
        await session.endSession();
        await client.close();
    }
    };

    main();
