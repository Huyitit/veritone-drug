# audit-log-testing-summary

## VE-3890

* [JIRA-VE-3890](https://veritone.atlassian.net/browse/VE-3890)

* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.organization.spec.js`

1. HAS-TEST-integrationSettings
2. HAS-TEST-organizationCreate
3. HAS-TEST-organizationUpdate
  * test
    1. `should index audit log when updating organization with the same name`
    2. `should index audit log when updating organization and executing update twice with same name`
      * fails see notes within test
4. HAS-TEST-organizationDelete
5. HAS-TEST-organizationInvitation
6. HAS-TEST-organizationRequest
7. HAS-TEST-organizationInvitationRequestRejected
8. HAS-TEST-organizationInvitationRequestApproved
9. HAS-TEST-organizationInvitationRejected
10. HAS-TEST-organizationInvitationAccepted


## VE-3891

* [JIRA-VE-3891](https://veritone.atlassian.net/browse/VE-3891)

* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.signup.spec.js`
* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.user.spec.js`
* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.recording.spec.js`
* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.watchList.spec.js`

1. HAS-TEST-trialSignUp
2. HAS-TEST-benchmarkSignUp
3. HAS-TEST-voiceSignUp
4. HAS-TEST-sportxSignUp
5. HAS-TEST-verisafeSignUp
6. HAS-TEST-developerTrialSignUp
7. HAS-TEST-automateStudioSignUp
8. FAILING-F1-awsReferralSignUp
9. HAS-TEST-redactSelfServiceSignUp
10. HAS-TEST-userCreate
11. HAS-TEST-userUpdate
12. HAS-TEST-userDelete
13. NO-TEST-unknown
14. HAS-TEST-recordingDeleted
15. HAS-TEST-recordingCreated
16. NA1-recordingInserted
17. HAS-TEST-recordingCognitionCompleted
18. NA1-recordingInsertFailed
  * see notes in test
19. HAS-TEST-S5-watchListUpdated
  * see test: `should index audit log events WatchListUpdated WHEN updating a watchList`
20. HAS-TEST-userCreated
21. HAS-TEST-userDeleted


## VE-3892

* [JIRA-VE-3892](https://veritone.atlassian.net/browse/VE-3892

* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.engine.spec.js`

1. HAS-TEST-engineBuildSubmit
2. HAS-TEST-engineBuildApprove
3. NEEDS-FEATURE-engineBuildDisapprove
  * test
    1. `disapprove engine build - new engine build process`
      * https://github.com/veritone/aiware-core/blob/master/services/api/core-graphql-server/citest/basicEngine.spec.js#L644-L669
      * this test is skipped and is a prerequisite for this test `disapprove engine build - nodeRed runtime` within `./services/api/core-graphql-server/citest/basicEngine.spec.js`
4. HAS-TEST-engineBuildCreate
5. HAS-TEST-engineBuildUpload
6. HAS-TEST-engineBuildInvalidate
7. HAS-TEST-engineBuildPause
8. HAS-TEST-engineBuildUnpause
9. HAS-TEST-engineBuildDelete
10. HAS-TEST-engineBuildUpdate
11. HAS-TEST-engineCreate
12. HAS-TEST-engineUpdate
13. HAS-TEST-engineDisable
14. HAS-TEST-engineEnable

## VE-3893

TODO current being worked

## VE-3894

* [JIRA-VE-3894](https://veritone.atlassian.net/browse/VE-3894)

* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.package.spec.js`
* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.basicJob.spec.js`
* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.basicJob-not-internal-engine.spec.js`
* see test within `./services/api/core-graphql-server/citest/local-docker/auditLog.mediaStreamer.spec.js`

1. HAS-TEST-s4-taskQueued 
  * see test: `update 2 jobs - to queued and index event to Audit Log for eventName TaskQueued and TaskQueued`
2. HAS-TEST-s4-taskUpdated 
  * see test: `update task in schedule job to complete and index event to Audit Log for eventName AssetMetadataUpdated and TaskUpdated`
3. NA4-taskCompleted 
  * Didn't see any emits with this repositories source.
4. HAS-TEST-S2-assetUploaded
  * see test: `should index audit log eventAssetUploaded and index event to Audit Log for eventName AssetUploaded`
5. HAS-TEST-S3-assetMetadataUpdated
  * see test: `update task in schedule job to complete and index event to Audit Log for eventName AssetMetadataUpdated`
6. HAS-TEST-NewVersionAvailable 
  * see test: `should add platform version and index event to audit log for eventName NewVersionAvailable`
7. HAS-TEST-NewVersionInstalled 
  * see test: `should set platform version and index event to audit log for eventName NewVersionInstalled`
8. HAS-TEST-packageCreated 
  * see test: `should create package with TDO 1 resources and index event to Audit Log for eventName PackageCreated`
9. HAS-TEST-packageDeleted
  * see test: `should delete package and index event to Audit Log for eventName PackageDeleted`
10. HAS-TEST-packageApproved 
  * see test: `should approve package with TDO 1 resources and index event to Audit Log for eventName PackageApproved`
11. FAILING-TEST-packageRejected 
  * see test: `should approve package with TDO 1 resources and index event to Audit Log for eventName PackageRejected`
  * see notes within the test
12. HAS-TEST-S1-packageInstalled
  * see test: `should create package with engine resources and index event to Audit Log for eventName PackageInstalled`
13. HAS-TEST-S1-packageGrantSet
  * see test: `should grant created package for the organization and remove the grant and index event to Audit Log for eventName PackageGrantSet and eventName PackageGrantRemoved`
14. HAS-TEST-S1-packageGrantRemoved
  * see test: `should grant created package for the organization and remove the grant and index event to Audit Log for eventName PackageGrantSet and eventName PackageGrantRemoved`
