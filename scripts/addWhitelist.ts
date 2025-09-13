import { run, ethers } from "hardhat";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
// CSV parsing without external dependencies

dotenv.config();

const PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";

const whitelistedAddresses = [
	"0x57EB513C19A2e02A31571d9929c98a5Da95997D8",
	"0xc0aBeA6Fda299bB097D850a5F3E719DAf24fdFfF",
	"0x2cF630D9DF619608400bDC3Cf2aAAB1E0042a446",
	"0x0403B37D070742B02b5E2Ff8014Aa2a5bb79c70a",
	"0xe276d61Ecb45059041B2B12bFd93B67Fb12B36F0",
	"0x70aCC72c048678F6F006aF8b194A6102c490Bc40",
	"0x35cAa290C9C724FcD699950eC494fd33Dc4C1fEF",
	"0xdEC4788F8c2928ec4e3b5bbC8188428A7b5e1630",
	"0xe8bB02eCf5abF1DA995377a76D1C451736eDe9Bb",
	"0x06d6f84a2016966A111326c8fF11f0BdA648C41a",
	"0x61a1D40346bDeDF611Cd3c89916894C6f8b8D63E",
	"0x1c3C272690328729641dC01A673E35FBC3727056",
	"0x4514B160C8190FA078A0bae62f76Fa6E37c8ef7E",
	"0xc78557ea4C5826DDbFFB94C19C60be7231778175",
	"0xccd05831016B444fFC83F6dA2e018F62849ab34A",
	"0xEa3fe6beD9a8284F8cA37C4C605D0e10702b5281",
	"0x29475b70068b5813d732A99d8514170863D65a0a",
	"0x762229E03aC76D5df17447EeF0c3e5caf60D9709",
	"0x07Ec34c56e1133861f9673e940b502b3758F284D",
	"0x25e2A352478B83dC0DE5d74beC53A8f13d4062B6",
	"0x3117f6e72b6479781Bd38dC3cdbf7497819c90E3",
	"0xEa2908e2903Ca2Ff77d6072C3AD8F2BD8d334319",
	"0x9bBa73BD675085289eaF175920460261B84fe0Fa",
	"0xfC33692632D4DcEf5005Cd73b43632Fca8035fEF",
	"0x45996082a1D37070c1ac7b9b493718095E0941D3",
	"0xfbaab157EA834fDef4d1bE9D59A41039177060dF",
	"0x15113142d5E1d03A2D6060f02612CC55addaf96B",
	"0xb6344d58b788e90F4012369cc80E533e58AF8f2a",
	"0x24C067A0346e84beDd3d35C31a7d21eE2F1695c3",
	"0x44Abfdf4DdC985fdb3Eb2D9c40C863bE90832Bc0",
	"0xdC27361494E95F566409f379ABd08813E73468eb",
	"0xbF63097d3185e5Bd8FAFc48195BBca516be70749",
	"0x5ff17A4fEC7Fc95F8c6751b62b1fC0321ebdF374",
	"0x824424a24e32D4c5f6bbE7b1d867FF50EBccd1f7",
	"0x711E5Bf65b17B331a50bdE223A25366C9D9249c0",
	"0x1E59078C552206473E2FE13DAA3bf7699A609F93",
	"0xaeA930a4Db278F376fcbc3263123b8BF1Cc9CA96",
	"0x7DA802843bAf9e4C77086C4E84043F178dd27Ce3",
	"0x770C85396D40546561714F4c31DBC9BD1F4c3809",
	"0x5519f929E28801A61c33d58027c6D21B1B5cF286",
	"0x36F26728D0ff396230B19Df681703ba53f3D5b11",
	"0xdC43a997950fc20B396833A99B33864fc24AF6Ee",
	"0x8cD4e42859DA483435F1816710AeAA2c41F639a9",
	"0xF89C3D6F1EFBe2C6D2000Ed8E4e28991FC07F822",
	"0x0820ca934E4eAd413F5181FEd24A57382F37D915",
	"0x0CA0AeC49A3BBF0CA19e133C5C9FE8F661f4e0d1",
	"0x99dedBd9Fe0c53Af62CfE68f34fa0bAa25517264",
	"0xc54E519Ce54427c5123A8b857fbF8e7D41215a38",
	"0x9025f4e241fa4b61feA0299606fD2e025D41371B",
	"0xD6616706580F9723724f30eFF1203e8bdef01492",
	"0x95EaF995F5e095586214b1f5c0E3C3a2508d866d",
	"0x3E08d25Fe61Ae0BAed3ffeE35686682292F71113",
	"0x920105fA9e1D98F0F1f557cdEb6d2c0c3A858783",
	"0x3485130Ad84C96A4c6DC2943567342131663B1E8",
	"0x43699A1A038B1AB81a5fF225133b97be21932809",
	"0xb6e6Cac0aa13FFa57D479b43ad1b0Ddf0C62Ce5E",
	"0x050EB9b2547303112E2DE19d2268f0AdF60E1196",
	"0xf08947Ffda9D41ab106c4f5f97EaEc806916E59D",
	"0x3670A71e5a976233Ff87c8aF00cDB2488A42f7B3",
	"0x0275d6DB392d0cA32Fe1e35a592a58A576DAA6c7",
	"0x72209e7591FD68E47cdD7B9fb2b09c91C11ac736",
	"0x87d585d0ed5efB8cfd374B789b1E872192C6b48d",
	"0x2126881a29b97B19574dc05Ec6989c04c1514953",
	"0xC70997295B7e5639072Cf238E44b200fc000CF3B",
	"0x3Df453866916D929a91AE8fC27D2600fe9A5c977",
	"0xc2e5Ba42892063CFc708e4Fb247A3B31F741ddF7",
	"0x8Ca0B373BfD19312c34fd006283868A42F533902",
	"0x5fc485474Cc4A3eB22Ecf62Ae4F15702DcC0BE37",
	"0x896731403300a03425944c8d598d07FE6a395856",
	"0x40e30E32aC76D389E338cdC32AC4F3AE28366405",
	"0x00Fab95ef2AEBe1ffF580F6563a74beCbd91A05B",
	"0x84ea36443D65521DF88f0737EDEFAcCDd3bcb216",
	"0x3eCB74985008b53Da1d13e403C37C42fb1E2C685",
	"0x4d61C2347963a6Bd90c8AdfD526F2372DA0B965B",
	"0x7ba69d3bD183a21164B0355E7cCe292476b467FE",
	"0xbA44E7F8227aCCff43ADE736C2c5B9fBf355bbe6",
	"0xF1dF252A84E13B347C811d6e598710e3c1f2C70E",
	"0xe673F5e474dBF76A1230FEA52e8e58F4BACa151c",
	"0x31432C1B4f1506fc9576ba80541329C1BEA3AB8C",
	"0xcF86B4689b47b575B2B12F6622AACBDB35C73Dbc",
	"0x6d57070870e10548F0F4C7a394025dE6DC22eD06",
	"0xe59AA281621f4F90a9E5E67Ea90De39Be8a0564d",
	"0x97a61676F774C91fa765163C0F979837b061De2b",
	"0x7562884a4E561A7434E503Da00ABaF6FBF2ac194",
	"0x4b83Ebea20CCbea6E4cE88F9075806CF5B7306D4",
	"0xcddBA4709CF6E918C4DFAD11bF9Ba3e6E0422BaB",
	"0x005f32745E5f0bcE9FB6C5c7E523a7A6223Bf1C1",
	"0xed01D36c1e315bb44b83d28bd78e78fFAE907ecf",
	"0x08444D3AeF5624b135C47826b56d1a6651642563",
	"0x1934e707C1571b0D3B9264801CB6E479465f13BA",
];



async function addToWhitelist(contract: any, addresses: string[], batchSize: number = 50): Promise<void> {
	const totalBatches = Math.ceil(addresses.length / batchSize);

	for (let i = 0; i < totalBatches; i++) {
		const start = i * batchSize;
		const end = Math.min(start + batchSize, addresses.length);
		const batch = addresses.slice(start, end);

		console.log(`\n🔄 Processing batch ${i + 1}/${totalBatches} (${batch.length} addresses)...`);

		try {
			const tx = await contract.addMultipleToWhitelist(batch);
			console.log(`⏳ Transaction submitted: ${tx.hash}`);

			const receipt = await tx.wait();
			console.log(`✅ Batch ${i + 1} confirmed in block ${receipt.blockNumber}`);
			console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

			// Show addresses in this batch
			batch.forEach((addr, index) => {
				console.log(`   ${start + index + 1}. ${addr}`);
			});
		} catch (error: any) {
			console.error(`❌ Failed to add batch ${i + 1}:`, error.message);

			// Try to add addresses one by one if batch fails
			console.log("🔄 Attempting to add addresses individually...");
			for (const address of batch) {
				try {
					const tx = await contract.addMultipleToWhitelist([address]);
					await tx.wait();
					console.log(`✅ Added individually: ${address}`);
				} catch (individualError: any) {
					console.error(`❌ Failed to add ${address}:`, individualError.message);
				}
			}
		}
	}
}

async function main(): Promise<void> {
	console.log("🔐 Adding addresses to Presale whitelist...");
	console.log("==========================================");

	// Check if contract address is provided
	if (!PRESALE_ADDRESS) {
		console.error("❌ BACKROOM_PRESALE_ADDRESS not found in environment variables");
		console.log("Please set BACKROOM_PRESALE_ADDRESS in your .env file");
		process.exit(1);
	}

	const presaleContract = await ethers.getContractAt("Presale", PRESALE_ADDRESS);

	try {
		await addToWhitelist(presaleContract, whitelistedAddresses);

		console.log("\n🎉 Whitelist update completed successfully!");
		console.log(`✅ Added ${whitelistedAddresses.length} addresses to the whitelist`);


	} catch (error: any) {
		console.error("\n❌ Failed to add addresses to whitelist:", error.message);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
