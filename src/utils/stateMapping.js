// State code to full name mapping utility
class StateMapper {
  static stateMapping = {
    'AL': 'Alabama',
    'AK': 'Alaska',
    'AZ': 'Arizona',
    'AR': 'Arkansas',
    'CA': 'California',
    'CO': 'Colorado',
    'CT': 'Connecticut',
    'DE': 'Delaware',
    'DC': 'DistrictOfColumbia',
    'FL': 'Florida',
    'GA': 'Georgia',
    'HI': 'Hawaii',
    'ID': 'Idaho',
    'IL': 'Illinois',
    'IN': 'Indiana',
    'IA': 'Iowa',
    'KS': 'Kansas',
    'KY': 'Kentucky',
    'LA': 'Louisiana',
    'ME': 'Maine',
    'MD': 'Maryland',
    'MA': 'Massachusetts',
    'MI': 'Michigan',
    'MN': 'Minnesota',
    'MS': 'Mississippi',
    'MO': 'Missouri',
    'MT': 'Montana',
    'NE': 'Nebraska',
    'NV': 'Nevada',
    'NH': 'NewHampshire',
    'NJ': 'NewJersey',
    'NM': 'NewMexico',
    'NY': 'NewYork',
    'NC': 'NorthCarolina',
    'ND': 'NorthDakota',
    'OH': 'Ohio',
    'OK': 'Oklahoma',
    'OR': 'Oregon',
    'PA': 'Pennsylvania',
    'RI': 'RhodeIsland',
    'SC': 'SouthCarolina',
    'SD': 'SouthDakota',
    'TN': 'Tennessee',
    'TX': 'Texas',
    'UT': 'Utah',
    'VT': 'Vermont',
    'VA': 'Virginia',
    'WA': 'Washington',
    'WV': 'WestVirginia',
    'WI': 'Wisconsin',
    'WY': 'Wyoming'
  };

  static codeToFullName(stateCode) {
    return this.stateMapping[stateCode?.toUpperCase()] || stateCode;
  }

  static fullNameToCode(fullName) {
    const entry = Object.entries(this.stateMapping)
      .find(([code, name]) => name.toLowerCase() === fullName.toLowerCase());
    return entry ? entry[0] : fullName;
  }

  static getAllStates() {
    return this.stateMapping;
  }

  static isValidStateCode(code) {
    return this.stateMapping.hasOwnProperty(code?.toUpperCase());
  }
}

module.exports = StateMapper;