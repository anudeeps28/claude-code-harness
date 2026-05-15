module.exports = {
  checkPrStatuses: require('./pr-statuses'),
  checkSprintStatuses: require('./sprint-statuses'),
  checkPeopleCrossRef: require('./people-cross-ref'),
  checkPeopleOneLiner: require('./people-one-liner'),
  checkBranchNaming: require('./branch-naming'),
  checkStoryBriefCrossRef: require('./story-brief-cross-ref'),
  checkNfrCoverage: require('./nfr-coverage'),
  checkServiceCoverage: require('./service-coverage'),
  checkPrdSectionRefs: require('./prd-section-refs'),
  checkAcTestCoverage: require('./ac-test-coverage'),
  checkAdrConsistency: require('./adr-consistency'),
};
